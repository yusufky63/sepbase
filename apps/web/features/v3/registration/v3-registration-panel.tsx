"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { zeroAddress, type Address } from "viem";
import type { V3ResolverInitialization } from "@sepbase/sdk";
import {
  type V3RegistrationFlowController,
  type V3RegistrationStage,
} from "@/lib/v3-registration-flow";
import { formatSettlementAmount } from "@/lib/settlement";
import { v3BrowserManifest } from "@/lib/v3-browser-runtime";
import { useV3RegistrationFlow } from "./use-v3-registration-flow";
import styles from "./v3-registration-panel.module.css";

export type V3RegistrationDuration = 1 | 2 | 3 | 4 | 5;
export type V3RegistrationQuoteStatus = "loading" | "ready" | "error";

type RegistrationSummaryProps = {
  action: ReactNode;
  durationYears: V3RegistrationDuration;
  fullName: string;
  onDurationYearsChange: (years: V3RegistrationDuration) => void;
  quoteAmount: bigint | null;
  quoteStatus: V3RegistrationQuoteStatus;
  status: string;
  termDisabled?: boolean;
};

type V3RegistrationPanelProps = {
  controller: V3RegistrationFlowController;
  durationYears: V3RegistrationDuration;
  payer: Address;
  recipient: Address;
  initialization: V3ResolverInitialization;
  quoteAmount: bigint | null;
  quoteStatus: V3RegistrationQuoteStatus;
  referrer?: Address | null;
  initialName: string;
  onDurationYearsChange: (years: V3RegistrationDuration) => void;
  onClearReferral?: () => void;
  onExport?: (serialized: string, warning: string) => void;
  onReferralConsumed?: () => void;
};

type V3RegistrationPreviewProps = Omit<RegistrationSummaryProps, "termDisabled">;

const stageLabels: Record<V3RegistrationStage, string> = {
  idle: "Choose a term, then review the exact name.",
  review: "Confirm the final spelling before continuing.",
  "attestation-required": "The name is ready for its secure availability check.",
  "attestation-ready": "Everything is ready. Start registration in your wallet.",
  committing: "Step 1 of 2 is waiting for wallet confirmation.",
  "too-early": "Step 1 is confirmed. The final step will be ready shortly.",
  ready: "Step 2 of 2 is ready. Complete your registration.",
  expired: "The registration window expired. Start again to continue safely.",
  revealing: "The final registration step is being confirmed.",
  complete: "Your name registration is complete.",
  "restart-required": "This registration needs to be restarted safely.",
};
const durationOptions = [1, 2, 3, 4, 5] as const;

function timestamp(value: bigint | undefined) {
  if (value === undefined) return null;
  try {
    return new Date(Number(value) * 1_000).toISOString();
  } catch {
    return null;
  }
}

function RegistrationSummary({
  action,
  durationYears,
  fullName,
  onDurationYearsChange,
  quoteAmount,
  quoteStatus,
  status,
  termDisabled = false,
}: RegistrationSummaryProps) {
  const payment = quoteStatus === "ready" && quoteAmount !== null
    ? `${formatSettlementAmount(quoteAmount, v3BrowserManifest.settlement.decimals)} test ${v3BrowserManifest.settlement.symbol}`
    : quoteStatus === "error" ? "Quote unavailable" : "Checking exact amount...";

  return (
    <div className={styles.registrationModule}>
      <div className={styles.registrationHeading}>
        <span>01 / REGISTRATION</span>
        <h2>Configure before you confirm.</h2>
      </div>
      <div className={styles.registrationLayout}>
        <div className={styles.registrationTerm}>
          <div>
            <p className={styles.fieldLabel}>REGISTRATION TERM</p>
            <div className={styles.segments} role="group" aria-label="Registration years">
              {durationOptions.map((years) => (
                <button
                  key={years}
                  type="button"
                  aria-pressed={durationYears === years}
                  disabled={termDisabled}
                  onClick={() => onDurationYearsChange(years)}
                >
                  {years}Y
                </button>
              ))}
            </div>
          </div>
          <p>The term changes the exact test-token amount. Your wallet shows the separate Base Sepolia network fee.</p>
        </div>
        <div className={styles.registrationFacts}>
          <div><span>FULL NAME</span><strong>{fullName}</strong></div>
          <div>
            <span>TEST PAYMENT / {durationYears} {durationYears === 1 ? "YEAR" : "YEARS"}</span>
            <strong>{payment}</strong>
            <small>Circle test USDC; no fiat value is implied.</small>
          </div>
          <div><span>NETWORK FEE</span><strong>Shown by wallet</strong><small>Paid separately in Base Sepolia ETH.</small></div>
          <div><span>REGISTRATION</span><strong>Two wallet steps</strong><small>Commit-reveal protects the name before registration.</small></div>
        </div>
      </div>
      {quoteStatus === "error" ? (
        <div className={styles.registrationError} role="alert">The current registration quote could not be verified. No payment action is available.</div>
      ) : null}
      <div className={styles.registrationFooter}>
        <div aria-live="polite"><span>STATUS</span><strong>{status}</strong></div>
        {action}
      </div>
    </div>
  );
}

export function V3RegistrationPreview(props: V3RegistrationPreviewProps) {
  return <RegistrationSummary {...props} />;
}

export function V3RegistrationPanel({
  controller,
  durationYears,
  payer,
  recipient,
  initialization,
  quoteAmount,
  quoteStatus,
  referrer,
  initialName,
  onDurationYearsChange,
  onClearReferral,
  onExport,
  onReferralConsumed,
}: V3RegistrationPanelProps) {
  const statusId = useId();
  const state = useV3RegistrationFlow(controller);
  const consumedReferral = useRef(false);
  const busy = state.stage === "committing" || state.stage === "revealing";
  const flowStarted = state.stage !== "idle";
  const sessionPrice = state.session ? BigInt(state.session.expectedAmount) : null;
  const selfReferral = Boolean(
    referrer
    && (referrer.toLowerCase() === payer.toLowerCase() || referrer.toLowerCase() === recipient.toLowerCase()),
  );
  const effectiveReferrer = selfReferral ? null : referrer;

  useEffect(() => {
    if (state.stage !== "complete" || consumedReferral.current || !referrer) return;
    consumedReferral.current = true;
    onReferralConsumed?.();
  }, [onReferralConsumed, referrer, state.stage]);

  function review() {
    try {
      controller.review({
        rawInput: initialName,
        payer,
        recipient,
        durationYears,
        ...(effectiveReferrer ? { referrer: effectiveReferrer } : {}),
        initialization,
      });
    } catch {
      // The controller exposes typed errors through its observable state where possible.
    }
  }

  function clearReferral() {
    try {
      if (state.draft && !state.session && !state.journal) {
        controller.review({
          rawInput: state.draft.rawInput,
          payer: state.draft.payer,
          recipient: state.draft.recipient,
          durationYears: state.draft.durationYears,
          initialization: state.draft.initialization,
        });
      }
      onClearReferral?.();
    } catch {
      // An in-flight attestation/transaction keeps the reviewed referrer immutable.
    }
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      // Wallet, network and contract failures remain visible in the controller state.
    }
  }

  const primaryAction = state.stage === "idle" ? (
    <button type="button" disabled={quoteStatus !== "ready" || quoteAmount === null} onClick={review}>Review name</button>
  ) : state.stage === "review" && state.normalized ? (
    <button type="button" onClick={() => controller.confirmCanonical(state.normalized!.normalizedLabel)}>
      Use &quot;{state.normalized.normalizedLabel}&quot;
    </button>
  ) : state.stage === "attestation-required" ? (
    <button type="button" onClick={() => void run(() => controller.requestAttestation())}>Prepare registration</button>
  ) : state.stage === "attestation-ready" ? (
    <button type="button" onClick={() => void run(() => controller.commit())}>Start registration</button>
  ) : state.stage === "ready" ? (
    <button type="button" onClick={() => void run(() => controller.reveal())}>Complete registration</button>
  ) : null;

  return (
    <section className={styles.panel} aria-labelledby={statusId}>
      <RegistrationSummary
        action={primaryAction}
        durationYears={durationYears}
        fullName={`${initialName}.${v3BrowserManifest.suffix}`}
        onDurationYearsChange={onDurationYearsChange}
        quoteAmount={sessionPrice ?? quoteAmount}
        quoteStatus={sessionPrice !== null ? "ready" : quoteStatus}
        status={stageLabels[state.stage]}
        termDisabled={flowStarted || busy}
      />

      {referrer ? (
        <div className={styles.registrationNotice} role={selfReferral ? "alert" : "status"}>
          <span>{selfReferral ? "REFERRAL REMOVED" : "REFERRAL ATTRIBUTION"}</span>
          <strong>{selfReferral ? "The payer or recipient cannot refer itself." : referrer}</strong>
          {onClearReferral && !state.session && !state.journal ? <button type="button" onClick={clearReferral}>Clear</button> : null}
        </div>
      ) : null}

      <div className={styles.srStatus} id={statusId} role="status" aria-live="polite">
        {stageLabels[state.stage]}
        {state.readiness ? (
          <span>{state.readiness.kind === "too-early"
            ? `${state.readiness.secondsRemaining.toString()} seconds until reveal.`
            : `${state.readiness.secondsRemaining.toString()} seconds remain in the safe reveal window.`}</span>
        ) : null}
      </div>

      {state.error ? (
        <div className={styles.registrationError} role="alert"><strong>{state.error.message}</strong></div>
      ) : null}

      {(state.session || state.journal) && onExport ? (
        <div className={styles.recovery}>
          <div><span>RECOVERY</span><strong>Keep a private recovery copy until registration completes.</strong></div>
          <button
            type="button"
            onClick={() => {
              const exported = controller.exportPendingSession();
              onExport(exported.serialized, exported.warning);
            }}
          >
            Download recovery file
          </button>
        </div>
      ) : null}

      {state.normalized || state.session ? (
        <details className={styles.advanced}>
          <summary>Advanced registration details</summary>
          <div className={styles.advancedContent}>
            {state.normalized ? (
              <dl className={styles.evidence}>
                <div><dt>ENTERED NAME</dt><dd>{state.draft?.rawInput}</dd></div>
                <div><dt>FINAL NAME</dt><dd>{state.normalized.normalizedFullName}</dd></div>
                <div><dt>LABELHASH</dt><dd><code>{state.normalized.labelHash}</code></dd></div>
                <div><dt>PAYER</dt><dd><code>{payer}</code></dd></div>
                <div><dt>RECIPIENT</dt><dd><code>{recipient}</code></dd></div>
                <div><dt>REFERRER</dt><dd><code>{state.draft?.referrer ?? zeroAddress}</code></dd></div>
              </dl>
            ) : null}
            {state.session ? (
              <dl className={styles.timeline}>
                <div><dt>STEP 1 TRANSACTION</dt><dd><code>{state.session.commit.transactionHash ?? "RECOVERED FROM CHAIN"}</code></dd></div>
                <div><dt>FINAL STEP READY</dt><dd><time dateTime={timestamp(BigInt(state.session.commit.earliestRevealAt)) ?? undefined}>{state.session.commit.earliestRevealAt}</time></dd></div>
                <div><dt>REGISTRATION WINDOW ENDS</dt><dd><time dateTime={timestamp(BigInt(state.session.commit.latestRevealAt)) ?? undefined}>{state.session.commit.latestRevealAt}</time></dd></div>
                <div><dt>AUTHORIZATION VALID UNTIL</dt><dd><time dateTime={timestamp(BigInt(state.session.attestation.validUntil)) ?? undefined}>{state.session.attestation.validUntil}</time></dd></div>
              </dl>
            ) : null}
            <footer className={styles.advancedFooter}>
              <strong>PRIVATE RECOVERY DATA</strong>
              <p>Keep recovery material private and delete it after registration completes.</p>
            </footer>
          </div>
        </details>
      ) : null}
    </section>
  );
}
