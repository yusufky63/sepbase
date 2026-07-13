"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  executeV3Plan,
  type V3ExecutionStage,
  type V3PlanExecutionResult,
} from "@/lib/v3-plan-executor";
import {
  V3MarketUiError,
  v3MarketIntentKey,
  type V3Address,
  type V3MarketActionIntent,
  type V3MarketActionSnapshot,
  type V3MarketExecutionContext,
  type V3MarketReadRequest,
  type V3MarketReaderAdapter,
  type V3ReleaseContext,
} from "./types";
import {
  acquireV3MarketExecutionLease,
  releaseV3MarketExecutionLease,
} from "./v3-market-execution-lock";

export type V3MarketWorkflowState =
  | { status: "idle"; intentKey: string }
  | { status: "loading"; intentKey: string; message: string }
  | { status: "unavailable"; intentKey: string; code: string; message: string; blockNumber: bigint | null }
  | { status: "ready"; intentKey: string; snapshot: V3MarketActionSnapshot }
  | {
    status: "processing";
    intentKey: string;
    stage: V3ExecutionStage;
    snapshot: V3MarketActionSnapshot;
  }
  | { status: "error"; intentKey: string; code: string; message: string }
  | {
    status: "complete";
    intentKey: string;
    snapshot: V3MarketActionSnapshot;
    result: V3PlanExecutionResult;
  };

type UseV3MarketWorkflowOptions = {
  release: V3ReleaseContext;
  account: V3Address;
  intent: V3MarketActionIntent;
  reader: V3MarketReaderAdapter;
  execution: V3MarketExecutionContext;
};

const executorErrorCopy: Record<string, string> = {
  V3_WRONG_CHAIN: "Switch to the manifest chain before retrying.",
  V3_WRONG_ACCOUNT: "The connected wallet does not match the prepared sender.",
  V3_APPROVAL_REVERTED: "The exact ERC-20 approval reverted; the market action was not submitted.",
  V3_PLAN_CHANGED_AFTER_APPROVAL: "Economic guards changed after approval. Review a new snapshot.",
  V3_APPROVAL_NOT_EFFECTIVE: "The confirmed allowance is still below the exact settlement amount.",
  MARKET_WRITE_IN_PROGRESS: "Another market wallet operation is already in progress. Wait for it to finish before starting a new write.",
};

function sameAddress(left: V3Address, right: V3Address) {
  return left.toLowerCase() === right.toLowerCase();
}

function safeError(error: unknown) {
  if (error instanceof V3MarketUiError) return error;
  if (error instanceof Error) {
    const message = executorErrorCopy[error.message];
    if (message) return new V3MarketUiError(error.message, message);
  }
  return new V3MarketUiError(
    "ADAPTER_FAILURE",
    "The market adapter failed. Refresh the block-pinned state before retrying.",
  );
}

function validateSnapshot(
  request: V3MarketReadRequest,
  snapshot: V3MarketActionSnapshot,
) {
  if (snapshot.kind !== request.intent.kind) {
    throw new V3MarketUiError("ACTION_MISMATCH", "The reader returned guards for a different action.");
  }
  if (snapshot.suiteReleaseId !== request.release.suiteReleaseId) {
    throw new V3MarketUiError("RELEASE_MISMATCH", "The snapshot belongs to another V3 suite release.");
  }
  if (snapshot.chainId !== request.release.chainId) {
    throw new V3MarketUiError("CHAIN_MISMATCH", "The snapshot belongs to another chain.");
  }
  if (!sameAddress(snapshot.expectedSender, request.account)) {
    throw new V3MarketUiError("SENDER_MISMATCH", "The snapshot was prepared for another account.");
  }
  if (snapshot.blockNumber < 1n) {
    throw new V3MarketUiError("BLOCK_MISSING", "The reader did not pin the guards to a valid block.");
  }

  if (request.intent.kind === "claim") {
    if (snapshot.nameContext !== null) {
      throw new V3MarketUiError("NAME_CONTEXT_UNEXPECTED", "A balance claim cannot carry a token name context.");
    }
  } else {
    if (!snapshot.nameContext) {
      throw new V3MarketUiError("NAME_CONTEXT_MISSING", "The token name context was not resolved at the guarded block.");
    }
    if (snapshot.nameContext.blockNumber !== snapshot.blockNumber) {
      throw new V3MarketUiError("NAME_CONTEXT_BLOCK_MISMATCH", "The token name was resolved at a different block than the economic guards.");
    }
    if ("tokenId" in request.intent && snapshot.nameContext.tokenId !== request.intent.tokenId) {
      throw new V3MarketUiError("NAME_CONTEXT_TOKEN_MISMATCH", "The reviewed name belongs to a different token ID.");
    }
  }

  const approval = snapshot.approval;
  if (!approval) return;
  if (snapshot.settlementFlow !== "collect" || snapshot.settlement.kind !== "erc20") {
    throw new V3MarketUiError("APPROVAL_UNEXPECTED", "Approval is valid only for ERC-20 collection.");
  }
  if (!snapshot.settlement.tokenAddress || !sameAddress(approval.token, snapshot.settlement.tokenAddress)) {
    throw new V3MarketUiError("APPROVAL_TOKEN_MISMATCH", "Approval token does not match settlement.");
  }
  if (approval.amount !== snapshot.settlementAmount) {
    throw new V3MarketUiError("APPROVAL_AMOUNT_MISMATCH", "Approval must equal the exact settlement amount.");
  }
}

function assertExecutable(
  request: V3MarketReadRequest,
  snapshot: V3MarketActionSnapshot,
) {
  if (!snapshot.permission.allowed) {
    throw new V3MarketUiError(
      "PERMISSION_DENIED",
      snapshot.permission.reason ?? "The connected account cannot perform this action.",
    );
  }
  if (request.intent.kind === "claim" && snapshot.settlementAmount === 0n) {
    throw new V3MarketUiError("ZERO_BALANCE", "There is no claimable balance at the pinned block.");
  }
  if (request.intent.kind !== "marketplace-approve" && snapshot.nftApproval?.required) {
    throw new V3MarketUiError(
      "MARKETPLACE_APPROVAL_REQUIRED",
      "Approve this individual name for the verified marketplace, then load a fresh action snapshot.",
    );
  }
}

export function useV3MarketWorkflow({
  release,
  account,
  intent,
  reader,
  execution,
}: UseV3MarketWorkflowOptions) {
  const intentKey = `${release.suiteReleaseId}|${release.chainId}|${account.toLowerCase()}|${v3MarketIntentKey(intent)}`;
  const request = useMemo<V3MarketReadRequest>(
    () => ({ release, account, intent }),
    [release, account, intent],
  );
  const [internalState, setInternalState] = useState<V3MarketWorkflowState>({
    status: "idle",
    intentKey,
  });
  const activeRun = useRef(0);

  useEffect(() => {
    activeRun.current += 1;
    return () => {
      activeRun.current += 1;
    };
  }, [intentKey]);

  const operational = release.status === "candidate" || release.status === "live";
  const state: V3MarketWorkflowState =
    internalState.intentKey === intentKey
      ? internalState
      : { status: "idle", intentKey };

  const readFresh = useCallback(async (run: number, message: string) => {
    setInternalState({ status: "loading", intentKey, message });
    const result = await reader.readAction(request);
    if (run !== activeRun.current) return null;
    if (result.status === "unavailable") {
      setInternalState({
        status: "unavailable",
        intentKey,
        code: result.code,
        message: result.message,
        blockNumber: result.blockNumber,
      });
      return null;
    }
    validateSnapshot(request, result.snapshot);
    return result.snapshot;
  }, [intentKey, reader, request]);

  const refresh = useCallback(async () => {
    const run = ++activeRun.current;
    if (!operational) {
      setInternalState({
        status: "unavailable",
        intentKey,
        code: "V3_NOT_DEPLOYED",
        message: "V3 is draft-only. Candidate or live release evidence is required before reads or writes.",
        blockNumber: null,
      });
      return;
    }

    try {
      const snapshot = await readFresh(run, "Checking current price and ownership.");
      if (snapshot) setInternalState({ status: "ready", intentKey, snapshot });
    } catch (error) {
      if (run !== activeRun.current) return;
      const safe = safeError(error);
      setInternalState({ status: "error", intentKey, code: safe.code, message: safe.message });
    }
  }, [intentKey, operational, readFresh]);

  const execute = useCallback(async () => {
    if (!operational) {
      setInternalState({
        status: "unavailable",
        intentKey,
        code: "V3_NOT_DEPLOYED",
        message: "V3 is draft-only. No reader, simulation or wallet adapter was called.",
        blockNumber: null,
      });
      return;
    }

    const lease = acquireV3MarketExecutionLease();
    if (!lease) {
      const safe = safeError(new Error("MARKET_WRITE_IN_PROGRESS"));
      setInternalState({ status: "error", intentKey, code: safe.code, message: safe.message });
      return;
    }
    const run = ++activeRun.current;

    try {
      const snapshot = await readFresh(run, "Checking the final price and ownership before your wallet opens.");
      if (!snapshot) return;
      assertExecutable(request, snapshot);

      if (
        execution.client.manifest.suiteReleaseId !== release.suiteReleaseId
        || execution.client.manifest.requiredConfirmations !== release.requiredConfirmations
        || execution.adapter.chainId !== release.chainId
        || !sameAddress(execution.adapter.account, account)
      ) {
        throw new V3MarketUiError(
          "EXECUTION_CONTEXT_MISMATCH",
          "The wallet, chain or SDK release does not match the reviewed snapshot.",
        );
      }

      const result = await executeV3Plan({
        client: execution.client,
        adapter: execution.adapter,
        prepare: () => reader.prepareAction(request, snapshot),
        onStage: (stage) => {
          if (run !== activeRun.current || stage === "error") return;
          setInternalState({ status: "processing", intentKey, stage, snapshot });
        },
      });
      if (run !== activeRun.current) return;
      if (
        result.plan.suiteReleaseId !== release.suiteReleaseId
        || result.plan.chainId !== release.chainId
        || !sameAddress(result.plan.expectedSender, account)
      ) {
        throw new V3MarketUiError("RESULT_MISMATCH", "The confirmed result does not match the reviewed release scope.");
      }
      setInternalState({ status: "complete", intentKey, snapshot, result });
    } catch (error) {
      if (run !== activeRun.current) return;
      const safe = safeError(error);
      setInternalState({ status: "error", intentKey, code: safe.code, message: safe.message });
    } finally {
      releaseV3MarketExecutionLease(lease);
    }
  }, [account, execution, intentKey, operational, readFresh, reader, release.chainId, release.requiredConfirmations, release.suiteReleaseId, request]);

  return { state, operational, refresh, execute };
}
