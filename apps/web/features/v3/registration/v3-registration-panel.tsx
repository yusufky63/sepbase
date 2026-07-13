"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { zeroAddress, type Address } from "viem";
import type { V3ResolverInitialization } from "@sepbase/sdk";
import {
  type V3RegistrationFlowController,
  type V3RegistrationStage,
} from "@/lib/v3-registration-flow";
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
  idle: "Enter a name to begin local ENSIP-15 review.",
  review: "Canonical confirmation is required.",
  "attestation-required": "Canonical review complete. Request a scoped attestation.",
  "attestation-ready": "Attestation verified. Review and submit the commitment.",
  committing: "Commitment transaction is awaiting confirmation.",
  "too-early": "Commit confirmed. Waiting for the earliest reveal time.",
  ready: "Commitment is ready for guarded reveal.",
  expired: "Commitment or attestation expired. A new commit is required.",
  revealing: "Reveal is being simulated, signed and reconciled.",
  complete: "Registration transaction confirmed and reconciled.",
  "restart-required": "Recovery intervention or a new commitment is required.",
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
        <span>V3 / NORMALIZE -&gt; COMMIT -&gt; REVEAL</span>
        <h2 id={`${statusId}-title`}>Register with every signed boundary visible.</h2>
        <p>No secret is placed in a URL, log, analytics event, MCP result or payment payload.</p>
      </header>

      <form className={styles.form} onSubmit={review}>
        <fieldset disabled={busy}>
          <legend>NAME AND TERM</legend>
          <label htmlFor={inputId}>Raw UTF-8 name</label>
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
          <button type="submit">Review canonical name</button>
        </fieldset>
      </form>

      {referrer ? (
        <div className={styles.referral} role={selfReferral ? "alert" : "status"}>
          <span>{selfReferral ? "REFERRAL REMOVED" : "REFERRAL ATTRIBUTION"}</span>
          <strong>{selfReferral
            ? "The connected payer or recipient cannot refer itself."
            : referrer}</strong>
          <p>Referral rewards accrue only to the referrer after a successful reveal; the registrant receives no discount.</p>
          {onClearReferral && !state.session && !state.journal ? (
            <button type="button" onClick={clearReferral}>Clear referral</button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.status} id={statusId} role="status" aria-live="polite">
        <span>CURRENT STATE / {state.stage.toUpperCase()}</span>
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

      {state.normalized ? (
        <dl className={styles.evidence}>
          <div>
            <dt>RAW INPUT</dt>
            <dd>{state.draft?.rawInput}</dd>
          </div>
          <div>
            <dt>CANONICAL LABEL</dt>
            <dd>{state.normalized.normalizedLabel}</dd>
          </div>
          <div>
            <dt>FULL NAME</dt>
            <dd>{state.normalized.normalizedFullName}</dd>
          </div>
          <div>
            <dt>LABELHASH</dt>
            <dd><code>{state.normalized.labelHash}</code></dd>
          </div>
          <div>
            <dt>PAYER</dt>
            <dd><code>{payer}</code></dd>
          </div>
          <div>
            <dt>RECIPIENT</dt>
            <dd><code>{recipient}</code></dd>
          </div>
          <div>
            <dt>REFERRER</dt>
            <dd><code>{state.draft?.referrer ?? zeroAddress}</code></dd>
          </div>
        </dl>
      ) : null}

      <div className={styles.actions} aria-label="Registration actions">
        {state.stage === "review" && state.normalized ? (
          <button type="button" onClick={() => controller.confirmCanonical(state.normalized!.normalizedLabel)}>
            Confirm canonical label &quot;{state.normalized.normalizedLabel}&quot;
          </button>
        ) : null}
        {state.stage === "attestation-required" ? (
          <button type="button" onClick={() => void run(() => controller.requestAttestation())}>
            Request scoped attestation
          </button>
        ) : null}
        {state.stage === "attestation-ready" ? (
          <button type="button" onClick={() => void run(() => controller.commit())}>
            Simulate and submit commitment
          </button>
        ) : null}
        {state.stage === "ready" ? (
          <button type="button" onClick={() => void run(() => controller.reveal())}>
            Re-read guards, simulate and reveal
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
            Export secret recovery data
          </button>
        ) : null}
      </div>

      {state.session ? (
        <dl className={styles.timeline}>
          <div>
            <dt>COMMIT TRANSACTION</dt>
            <dd><code>{state.session.commit.transactionHash ?? "UNKNOWN / RECOVERED FROM CHAIN"}</code></dd>
          </div>
          <div>
            <dt>EARLIEST REVEAL</dt>
            <dd><time dateTime={timestamp(BigInt(state.session.commit.earliestRevealAt)) ?? undefined}>{state.session.commit.earliestRevealAt}</time></dd>
          </div>
          <div>
            <dt>COMMITMENT EXPIRY</dt>
            <dd><time dateTime={timestamp(BigInt(state.session.commit.latestRevealAt)) ?? undefined}>{state.session.commit.latestRevealAt}</time></dd>
          </div>
          <div>
            <dt>ATTESTATION VALID UNTIL</dt>
            <dd><time dateTime={timestamp(BigInt(state.session.attestation.validUntil)) ?? undefined}>{state.session.attestation.validUntil}</time></dd>
          </div>
        </dl>
      ) : null}

      <footer className={styles.footer}>
        <strong>RECOVERY SAFETY</strong>
        <p>Device-local storage is not an XSS boundary. Explicit exports contain the secret and must stay off telemetry and URLs.</p>
      </footer>
    </section>
  );
}
