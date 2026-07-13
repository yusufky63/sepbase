"use client";

import { formatUnits } from "viem";
import { useId } from "react";
import {
  V3_MARKET_ACTION_COPY,
  type V3Address,
  type V3MarketActionIntent,
  type V3MarketActionSnapshot,
  type V3MarketExecutionContext,
  type V3MarketReaderAdapter,
  type V3ReleaseContext,
} from "./types";
import { useV3MarketWorkflow, type V3MarketWorkflowState } from "./use-v3-market-workflow";
import { useV3MarketExecutionLocked } from "./v3-market-execution-lock";
import styles from "./v3-market-action-panel.module.css";

type V3MarketActionPanelProps = {
  release: V3ReleaseContext;
  account: V3Address;
  intent: V3MarketActionIntent;
  reader: V3MarketReaderAdapter;
  execution: V3MarketExecutionContext;
};

const stageCopy = {
  preparing: "Checking the latest name and price",
  "approval-check": "Checking payment permission",
  "approval-simulating": "Preparing payment permission",
  "approval-signing": "Confirm payment permission in your wallet",
  "approval-confirming": "Waiting for payment permission",
  refreshing: "Refreshing the final price and ownership",
  simulating: "Running a final safety check",
  signing: "Review and confirm in your wallet",
  confirming: "Waiting for transaction confirmation",
  confirmed: "Transaction confirmed",
  error: "Transaction stopped",
} as const;

function fieldLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ").toUpperCase();
}

function fieldValue(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function timestamp(value: bigint) {
  if (value < 0n || value > 8_640_000_000_000n) return value.toString();
  return new Date(Number(value) * 1_000).toLocaleString();
}

function snapshotFromState(state: V3MarketWorkflowState) {
  if (state.status === "ready" || state.status === "processing" || state.status === "complete") {
    return state.snapshot;
  }
  return null;
}

function intendedRecipient(
  intent: V3MarketActionIntent,
  snapshot: V3MarketActionSnapshot | null,
) {
  if ("recipient" in intent) return intent.recipient;
  if (!snapshot) return null;
  if (snapshot.kind.startsWith("offer-") && "expectedRecipient" in snapshot.guards) {
    return snapshot.guards.expectedRecipient;
  }
  if (snapshot.kind.startsWith("auction-") && "expectedHighestBidRecipient" in snapshot.guards) {
    return snapshot.guards.expectedHighestBidRecipient;
  }
  return null;
}

export function V3MarketActionPanel({
  release,
  account,
  intent,
  reader,
  execution,
}: V3MarketActionPanelProps) {
  const titleId = useId();
  const copy = V3_MARKET_ACTION_COPY[intent.kind];
  const workflow = useV3MarketWorkflow({ release, account, intent, reader, execution });
  const marketExecutionLocked = useV3MarketExecutionLocked();
  const snapshot = snapshotFromState(workflow.state);
  const locallyBusy = workflow.state.status === "loading" || workflow.state.status === "processing";
  const busy = locallyBusy || marketExecutionLocked;
  const zeroClaim = intent.kind === "claim" && snapshot?.settlementAmount === 0n;
  const nftApprovalBlocks = intent.kind !== "marketplace-approve" && snapshot?.nftApproval?.required === true;
  const canExecute = Boolean(
    workflow.operational
    && workflow.state.status === "ready"
    && snapshot?.permission.allowed
    && !zeroClaim
    && !nftApprovalBlocks,
  );
  const recipient = intendedRecipient(intent, snapshot);
  const refreshLabel =
    workflow.state.status === "error" || workflow.state.status === "unavailable"
      ? "Try again"
      : workflow.state.status === "complete"
        ? "Refresh current details"
        : "Review current details";

  return (
    <section className={styles.panel} aria-labelledby={titleId} aria-busy={busy}>
      <header className={styles.header}>
        <div>
          <span>{copy.group}</span>
          <h3 id={titleId}>{copy.title}</h3>
          <p>Review the current name, amount and recipient before continuing.</p>
        </div>
      </header>

      <details className={styles.advanced}>
        <summary>Advanced request details</summary>
        <dl className={styles.advancedMeta}>
          <div><dt>ACCOUNT</dt><dd><code>{account}</code></dd></div>
          <div><dt>CHAIN</dt><dd>{release.chainId}</dd></div>
          <div><dt>SUITE</dt><dd><code>{release.suiteReleaseId}</code></dd></div>
        </dl>
        <div className={styles.requestGrid} aria-label="Requested action inputs">
          {Object.entries(intent).filter(([key]) => key !== "kind").map(([key, value]) => (
            <div key={key}>
              <span>{fieldLabel(key)}</span>
              <code>{fieldValue(value)}</code>
            </div>
          ))}
        </div>
      </details>

      {!workflow.operational ? (
        <div className={styles.draftBoundary} role="status">
          <span>V3_NOT_DEPLOYED</span>
          <strong>DRAFT HAS NO TRANSACTION AUTHORITY</strong>
          <p>
            Candidate or live release evidence is required. No reader, simulation, approval,
            signer, or broadcast adapter will be called from this state.
          </p>
        </div>
      ) : null}

      {workflow.state.status === "idle" && workflow.operational ? (
        <div className={styles.neutralState} role="status">
          Review current details before continuing.
        </div>
      ) : null}

      {workflow.state.status === "loading" ? (
        <div className={styles.neutralState} role="status">{workflow.state.message}</div>
      ) : null}

      {workflow.state.status === "processing" ? (
        <div className={styles.processingState} role="status" aria-live="polite">
          <span>TRANSACTION</span>
          <strong>{stageCopy[workflow.state.stage]}</strong>
          <p>Keep this page open until confirmation is complete.</p>
        </div>
      ) : null}

      {workflow.state.status === "unavailable" ? (
        <div className={styles.errorState} role="alert">
          <span>TRY AGAIN</span>
          <strong>CURRENT DETAILS COULD NOT BE LOADED</strong>
          <p>{workflow.state.message}</p>
        </div>
      ) : null}

      {workflow.state.status === "error" ? (
        <div className={styles.errorState} role="alert">
          <span>NOT COMPLETED</span>
          <strong>THE TRANSACTION STOPPED SAFELY</strong>
          <p>{workflow.state.message}</p>
          <p>Nothing is retried automatically. Review current details before trying again.</p>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className={styles.reviewGrid}>
            <div>
              <span>NAME</span>
              <strong>{snapshot.nameContext?.fullName ?? "NOT APPLICABLE"}</strong>
            </div>
            <div data-zero={snapshot.settlementAmount === 0n ? "true" : "false"}>
              <span>AMOUNT</span>
              <strong>
                {snapshot.settlementAmount === 0n ? "ZERO / " : ""}
                {formatUnits(snapshot.settlementAmount, snapshot.settlement.decimals)} {snapshot.settlement.symbol}
              </strong>
            </div>
            <div>
              <span>RECIPIENT</span>
              <code>{recipient ?? "NOT APPLICABLE"}</code>
            </div>
            <div>
              <span>READY</span>
              <strong>{snapshot.permission.allowed ? "YES" : "NO"}</strong>
              {snapshot.permission.reason ? <small>{snapshot.permission.reason}</small> : null}
            </div>
          </div>

          <details className={styles.advanced}>
            <summary>Advanced safety checks</summary>
            <div className={styles.snapshotGrid}>
            <div>
              <span>PINNED BLOCK</span>
              <strong>{snapshot.blockNumber.toString()}</strong>
            </div>
            <div>
              <span>OBJECT STATE</span>
              <strong>{snapshot.objectStatus} / {snapshot.stale ? "STALE" : "CURRENT"}</strong>
            </div>
            <div>
              <span>NAME AT PINNED BLOCK</span>
              {snapshot.nameContext ? (
                <>
                  <strong>{snapshot.nameContext.fullName}</strong>
                  <small>
                    TOKEN {snapshot.nameContext.tokenId.toString()} / {snapshot.nameContext.lifecycle.toUpperCase()} / EXPIRES {timestamp(snapshot.nameContext.expiresAt)}
                  </small>
                </>
              ) : <strong>NOT APPLICABLE</strong>}
            </div>
            <div data-zero={snapshot.settlementAmount === 0n ? "true" : "false"}>
              <span>SETTLEMENT AMOUNT</span>
              <strong>
                {snapshot.settlementAmount === 0n ? "ZERO / " : ""}
                {formatUnits(snapshot.settlementAmount, snapshot.settlement.decimals)} {snapshot.settlement.symbol}
              </strong>
              <small>{snapshot.settlementFlow.toUpperCase()} / {snapshot.settlement.kind.toUpperCase()}</small>
            </div>
            <div>
              <span>PERMISSION</span>
              <strong>{snapshot.permission.allowed ? "ALLOWED AT SNAPSHOT" : "BLOCKED"}</strong>
              {snapshot.permission.reason ? <small>{snapshot.permission.reason}</small> : null}
            </div>
            <div>
              <span>INTENDED RECIPIENT</span>
              <code>{recipient ?? "NOT APPLICABLE"}</code>
            </div>
            <div>
              <span>APPROVAL</span>
              <strong>
                {snapshot.approval?.required
                  ? `EXACT ${formatUnits(snapshot.approval.amount, snapshot.settlement.decimals)} ${snapshot.settlement.symbol}`
                  : "NOT REQUIRED"}
              </strong>
              {snapshot.approval ? <code>Spender: {snapshot.approval.spender}</code> : null}
            </div>
            <div>
              <span>NFT MARKET APPROVAL</span>
              <strong>
                {snapshot.nftApproval
                  ? snapshot.nftApproval.required
                    ? "PER-TOKEN APPROVAL REQUIRED"
                    : "ACTIVE AT PINNED BLOCK"
                  : "NOT APPLICABLE"}
              </strong>
              {snapshot.nftApproval ? (
                <small>
                  TOKEN {snapshot.nftApproval.tokenId.toString()} / SET-APPROVAL-FOR-ALL {snapshot.nftApproval.approvedForAll ? "ACTIVE" : "NOT USED"}
                </small>
              ) : null}
            </div>
            </div>

            <div className={styles.guardSection}>
              <div className={styles.guardHeading}>
                <span>FRESH ECONOMIC GUARDS</span>
                <strong>{Object.keys(snapshot.guards).length} VALUES</strong>
              </div>
              <dl>
                {Object.entries(snapshot.guards).map(([key, value]) => (
                  <div key={key}>
                    <dt>{fieldLabel(key)}</dt>
                    <dd><code>{fieldValue(value)}</code></dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        </>
      ) : null}

      {workflow.state.status === "complete" ? (
        <div className={styles.completeState} role="status">
          <span>COMPLETE</span>
          <strong>TRANSACTION CONFIRMED</strong>
          <p>Your market balance and name state have been refreshed.</p>
          <details>
            <summary>Transaction reference</summary>
            <code>{workflow.state.result.hash}</code>
          </details>
        </div>
      ) : null}

      <footer className={styles.actions}>
        <button
          type="button"
          onClick={() => void workflow.refresh()}
          disabled={!workflow.operational || busy}
        >
          {refreshLabel}
        </button>
        <button
          type="button"
          onClick={() => void workflow.execute()}
          disabled={!canExecute || busy}
        >
          {copy.executeLabel}
        </button>
      </footer>
    </section>
  );
}
