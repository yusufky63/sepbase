"use client";

import { useCallback, useRef, useState } from "react";
import { parseAbi, type Address, type Hash, type PublicClient } from "viem";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import type { SepbaseV3Client, V3TransactionPlan } from "@sepbase/sdk";
import { getV3BrowserClient } from "./v3-browser-runtime";
import {
  executeV3Plan,
  type V3ExecutionStage,
  type V3PlanExecutionAdapter,
  type V3PlanExecutionResult,
} from "./v3-plan-executor";

const allowanceAbi = parseAbi(["function allowance(address owner,address spender) view returns (uint256)"]);

type SendTransaction = (request: {
  account: Address;
  to: Address;
  data: `0x${string}`;
  value: bigint;
  chainId: number;
}) => Promise<Hash>;

export function createV3WagmiAdapter(input: {
  account: Address;
  chainId: number;
  publicClient: Pick<PublicClient, "readContract" | "call" | "waitForTransactionReceipt">;
  sendTransaction: SendTransaction;
}): V3PlanExecutionAdapter {
  return {
    account: input.account,
    chainId: input.chainId,
    async readAllowance({ token, owner, spender }) {
      return input.publicClient.readContract({
        address: token,
        abi: allowanceAbi,
        functionName: "allowance",
        args: [owner, spender],
      });
    },
    async simulate(transaction) {
      await input.publicClient.call({
        account: transaction.account,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      });
    },
    send: input.sendTransaction,
    async waitForReceipt({ hash, confirmations }) {
      const receipt = await input.publicClient.waitForTransactionReceipt({ hash, confirmations });
      return { status: receipt.status, blockNumber: receipt.blockNumber };
    },
  };
}

export function useV3PlanExecution() {
  const account = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync, reset: resetSender } = useSendTransaction();
  const [stage, setStage] = useState<V3ExecutionStage | "idle">("idle");
  const [result, setResult] = useState<V3PlanExecutionResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const executing = useRef(false);

  const execute = useCallback(async (
    prepare: (client: SepbaseV3Client) => Promise<V3TransactionPlan>,
  ) => {
    if (executing.current) throw new Error("V3_EXECUTION_ALREADY_PENDING");
    executing.current = true;
    setStage("preparing");
    setError(null);
    setResult(null);
    try {
      if (!account.address || !account.chainId || !publicClient) throw new Error("V3_WALLET_NOT_READY");
      const client = await getV3BrowserClient();
      const adapter = createV3WagmiAdapter({
        account: account.address,
        chainId: account.chainId,
        publicClient,
        sendTransaction: (request) => sendTransactionAsync(request as never),
      });
      const next = await executeV3Plan({
        client,
        adapter,
        prepare: () => prepare(client),
        onStage: setStage,
      });
      setResult(next);
      return next;
    } catch (nextError) {
      setStage("error");
      setError(nextError);
      throw nextError;
    } finally {
      executing.current = false;
    }
  }, [account.address, account.chainId, publicClient, sendTransactionAsync]);

  const reset = useCallback(() => {
    setStage("idle");
    setResult(null);
    setError(null);
    resetSender();
  }, [resetSender]);

  return {
    execute,
    reset,
    stage,
    result,
    error,
    isPending: stage !== "idle" && stage !== "confirmed" && stage !== "error",
  };
}
