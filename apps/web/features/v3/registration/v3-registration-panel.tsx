"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { formatUnits, zeroAddress, type Address } from "viem";
import type { V3ResolverInitialization } from "@sepbase/sdk";
import {
  type V3RegistrationFlowController,
  type V3RegistrationStage,
} from "@/lib/v3-registration-flow";
import { v3BrowserManifest } from "@/lib/v3-browser-runtime";
import { useV3RegistrationFlow } from "./use-v3-registration-flow";
import styles from "./v3-registration-panel.module.css";

type V3RegistrationPanelProps = {
  controller: V3RegistrationFlowController;
  payer: Address;
  recipient: Address;
  initialization: V3ResolverInitialization;
  referrer?: Address | null;
  initialName?: string;
  onClearReferral?: () => void;
  onExport?: (serialized: string, warning: string) => void;
  onReferralConsumed?: () => void;
};

const stageLabels: Record<V3RegistrationStage, string> = {
  idle: "Enter a name and choose how long you want to keep it.",
  review: "Review the final spelling before continuing.",
  "attestation-required": "Your name is ready for a secure availability check.",
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

export function V3RegistrationPanel({
  controller,
  payer,
  recipient,
  initialization,
  referrer,
  initialName = "",
  onClearReferral,
  onExport,
  onReferralConsumed,
}: V3RegistrationPanelProps) {
  const inputId = useId();
  const durationId = useId();
  const statusId = useId();
  const [rawInput, setRawInput] = useState(initialName);
  const [durationYears, setDurationYears] = useState<1 | 2 | 3 | 4 | 5>(1);
  const state = useV3RegistrationFlow(controller);
  const consumedReferral = useRef(false);
  const busy = state.stage === "committing" || state.stage === "revealing";
  const registrationPrice = state.session
    ? `${formatUnits(BigInt(state.session.expectedAmount), v3BrowserManifest.settlement.decimals)} ${v3BrowserManifest.settlement.symbol}`
    : null;
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

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      controller.review({
        rawInput,
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

  return (
    <section className={styles.panel} aria-labelledby={`${statusId}-title`}>
      <header className={styles.header}>
        <span>REGISTER / {v3BrowserManifest.chainName.toUpperCase()}</span>
        <h2 id={`${statusId}-title`}>Register your .{v3BrowserManifest.suffix} name.</h2>
        <p>Registration uses two protected wallet confirmations. The page will guide you through each step.</p>
      </header>

      <div className={styles.payment}>
        <span>PAYMENT</span>
        <strong>{registrationPrice ?? `Confirmed before signing · ${v3BrowserManifest.settlement.symbol}`}</strong>
        <p>Registration is paid with test {v3BrowserManifest.settlement.symbol}. Network fees use Base Sepolia ETH.</p>
      </div>

      <form className={styles.form} onSubmit={review}>
        <fieldset disabled={busy}>
          <legend>NAME AND TERM</legend>
          <label htmlFor={inputId}>Name</label>
          <input
            id={inputId}
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={statusId}
            required
          />
          <label htmlFor={durationId}>Registration term</label>
          <select
            id={durationId}
            value={durationYears}
            onChange={(event) => setDurationYears(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)}
          >
            {durationOptions.map((years) => (
              <option key={years} value={years}>{years} {years === 1 ? "year" : "years"}</option>
            ))}
          </select>
          <button type="submit">Review name</button>
        </fieldset>
      </form>

      {referrer ? (
        <div className={styles.referral} role={selfReferral ? "alert" : "status"}>
          <span>{selfReferral ? "REFERRAL REMOVED" : "REFERRAL ATTRIBUTION"}</span>
          <strong>{selfReferral
            ? "The connected payer or recipient cannot refer itself."
            : referrer}</strong>
          <p>The referrer receives a reward after registration. Your registration price does not change.</p>
          {onClearReferral && !state.session && !state.journal ? (
            <button type="button" onClick={clearReferral}>Clear referral</button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.status} id={statusId} role="status" aria-live="polite">
        <span>REGISTRATION STATUS</span>
        <strong>{stageLabels[state.stage]}</strong>
        {state.readiness ? (
          <p>
            {state.readiness.kind === "too-early"
              ? `${state.readiness.secondsRemaining.toString()} seconds until reveal.`
              : `${state.readiness.secondsRemaining.toString()} seconds remain in the safe reveal window.`}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <div className={styles.error} role="alert">
          <strong>{state.error.code}</strong>
          <p>{state.error.message}</p>
        </div>
      ) : null}

      <div className={styles.actions} aria-label="Registration actions">
        {state.stage === "review" && state.normalized ? (
          <button type="button" onClick={() => controller.confirmCanonical(state.normalized!.normalizedLabel)}>
            Use &quot;{state.normalized.normalizedLabel}&quot;
          </button>
        ) : null}
        {state.stage === "attestation-required" ? (
          <button type="button" onClick={() => void run(() => controller.requestAttestation())}>
            Prepare registration
          </button>
        ) : null}
        {state.stage === "attestation-ready" ? (
          <button type="button" onClick={() => void run(() => controller.commit())}>
            Start registration
          </button>
        ) : null}
        {state.stage === "ready" ? (
          <button type="button" onClick={() => void run(() => controller.reveal())}>
            Complete registration
          </button>
        ) : null}
        {(state.session || state.journal) && onExport ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              const exported = controller.exportPendingSession();
              onExport(exported.serialized, exported.warning);
            }}
          >
            Download recovery file
          </button>
        ) : null}
      </div>

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
            <footer className={styles.footer}>
              <strong>RECOVERY FILE</strong>
              <p>The optional recovery file contains sensitive registration material. Keep it private and delete it after registration completes.</p>
            </footer>
          </div>
        </details>
      ) : null}
    </section>
  );
}
