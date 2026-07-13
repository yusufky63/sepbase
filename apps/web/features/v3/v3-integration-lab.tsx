"use client";

import {
  NameNormalizationError,
  normalizeName,
  type NormalizedName,
} from "@sepbase/sdk";
import { useId, useMemo, useState } from "react";
import v3Manifest from "../../public/deployment-manifest.v3.json";
import styles from "./v3-integration-lab.module.css";

type NormalizerView =
  | { kind: "idle" }
  | { kind: "valid"; value: NormalizedName }
  | {
    kind: "error";
    code: string;
    message: string;
    normalizedSuggestion?: string;
  };

const releaseStages = [
  {
    id: "draft",
    label: "DRAFT",
    description: "Source and configuration discovery only.",
  },
  {
    id: "candidate",
    label: "CANDIDATE",
    description: "Requires deployed addresses and release evidence.",
  },
  {
    id: "live",
    label: "LIVE",
    description: "Requires final-origin parity and acceptance.",
  },
] as const;

const contractModules = Object.entries(v3Manifest.contracts);

const releaseBoundary = v3Manifest.releaseStatus === "draft"
  ? {
      title: "DRAFT SAFETY BOUNDARY",
      summary: "Null addresses and draft status mean the suite is not deployed or live.",
      detail: "The lab never falls through to V2 or requests V3 chain state from an address-free draft.",
    }
  : v3Manifest.releaseStatus === "candidate"
    ? {
        title: "CANDIDATE SAFETY BOUNDARY",
        summary: "Addresses and runtime identities are deployed and release-verified; candidate status is not a live acceptance claim.",
        detail: "Verified V3 reads and wallet-driven workflows are available, while paid x402 and live promotion remain disabled.",
      }
    : {
        title: "LIVE RELEASE BOUNDARY",
        summary: "The manifest is the promoted live V3 release identity.",
        detail: "The local normalizer still never signs, pays, or broadcasts a transaction.",
      };

function moduleLabel(identifier: string) {
  return identifier.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

function deriveName(rawInput: string): NormalizerView {
  if (!rawInput.trim()) return { kind: "idle" };

  try {
    return {
      kind: "valid",
      value: normalizeName(rawInput, v3Manifest.suffix, {
        minCodePoints: v3Manifest.nameRules.minCodepoints,
        maxCodePoints: v3Manifest.nameRules.maxCodepoints,
        maxUtf8Bytes: v3Manifest.nameRules.maxUtf8Bytes,
      }),
    };
  } catch (error) {
    if (error instanceof NameNormalizationError) {
      return {
        kind: "error",
        code: error.code,
        message: error.message,
        ...(error.normalizedSuggestion
          ? { normalizedSuggestion: error.normalizedSuggestion }
          : {}),
      };
    }

    return {
      kind: "error",
      code: "NORMALIZATION_FAILED",
      message: "The pinned ENSIP-15 normalizer could not derive a canonical name.",
    };
  }
}

function capabilityState(enabled: boolean, disabledLabel = "NOT SUPPORTED") {
  return enabled ? "SUPPORTED" : disabledLabel;
}

export function V3IntegrationLab() {
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();
  const [rawInput, setRawInput] = useState("alice");
  const [confirmedCanonicalLabel, setConfirmedCanonicalLabel] = useState<string | null>(null);
  const normalizerView = useMemo(() => deriveName(rawInput), [rawInput]);

  const normalized = normalizerView.kind === "valid" ? normalizerView.value : null;
  const canonicalChanged = Boolean(
    normalized && (normalized.changed || rawInput !== rawInput.trim()),
  );
  const confirmationRequired = Boolean(
    canonicalChanged && confirmedCanonicalLabel !== normalized?.normalizedLabel,
  );
  const locallyReady = Boolean(normalized && !confirmationRequired);

  return (
    <div className={styles.lab}>
      <article className={styles.releasePanel} aria-labelledby="v3-release-panel-title">
        <header className={styles.panelHeader}>
          <span>STATIC RELEASE PANEL</span>
          <h3 id="v3-release-panel-title">V3 source truth, with deployment state explicit.</h3>
          <p>
            Read directly from <code>/deployment-manifest.v3.json</code>. {releaseBoundary.summary}
          </p>
        </header>

        <ol className={styles.releaseStages} aria-label="V3 release stages">
          {releaseStages.map((stage, index) => {
            const current = stage.id === v3Manifest.releaseStatus;
            return (
              <li key={stage.id} data-current={current ? "true" : "false"}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong aria-current={current ? "step" : undefined}>
                    {stage.label}{current ? " / CURRENT SOURCE STATE" : " / NOT CURRENT"}
                  </strong>
                  <p>{stage.description}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <dl className={styles.releaseFacts}>
          <div>
            <dt>SUITE RELEASE ID</dt>
            <dd><code>{v3Manifest.suiteReleaseId}</code></dd>
          </div>
          <div>
            <dt>SETTLEMENT TARGET</dt>
            <dd>
              <strong>{v3Manifest.settlement.symbol} / {v3Manifest.settlement.decimals} DECIMALS</strong>
              <code>{v3Manifest.settlement.tokenAddress}</code>
              <span>{v3Manifest.x402.network}; gas remains {v3Manifest.nativeCurrency.symbol}</span>
            </dd>
          </div>
          <div>
            <dt>NORMALIZATION PROFILE</dt>
            <dd>
              <strong>{v3Manifest.normalization.profileId}</strong>
              <code>{v3Manifest.normalization.profileHash}</code>
              <span>Fixture SHA-256: {v3Manifest.normalization.fixtureSha256}</span>
            </dd>
          </div>
          <div>
            <dt>SUITE WIRING</dt>
            <dd>
              <strong>{v3Manifest.wiring.suiteConfigured ? "CONFIGURED" : "NOT CONFIGURED"}</strong>
              <span>Deployment block: {v3Manifest.deployment.blockNumber ?? "null"}</span>
            </dd>
          </div>
        </dl>

        <section className={styles.inventory} aria-labelledby="v3-module-inventory-title">
          <div className={styles.subheading}>
            <span>SEVEN-MODULE INVENTORY</span>
            <strong id="v3-module-inventory-title">{contractModules.length} SOURCE MODULES</strong>
          </div>
          <ol>
            {contractModules.map(([identifier, module], index) => (
              <li key={identifier}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{moduleLabel(identifier)}</strong>
                  <code>{module.address ?? "ADDRESS NULL / NOT DEPLOYED"}</code>
                  <small>{module.version} · {module.abiUrl}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.limitations} aria-labelledby="v3-limitations-title">
          <div className={styles.subheading}>
            <span>EXPLICIT LIMITATIONS</span>
            <strong id="v3-limitations-title">NO CAPABILITY INFERENCE</strong>
          </div>
          <ul>
            <li><span>CONTENTHASH</span><strong>{capabilityState(v3Manifest.capabilities.contenthash)}</strong></li>
            <li><span>CCIP-READ</span><strong>{capabilityState(v3Manifest.capabilities.ccipRead)}</strong></li>
            <li><span>SMART MULTICALL</span><strong>{capabilityState(v3Manifest.capabilities.smartMulticall)}</strong></li>
            <li><span>PAID x402</span><strong>{capabilityState(v3Manifest.capabilities.paidX402 && v3Manifest.x402.paidExecutionAvailable, "FALSE / DISABLED")}</strong></li>
          </ul>
        </section>
      </article>

      <article className={styles.normalizerPanel} aria-labelledby="v3-normalizer-title">
        <header className={styles.panelHeader}>
          <span>LOCAL ENSIP-15 LAB</span>
          <h3 id="v3-normalizer-title">Inspect the exact canonical identity before any signature.</h3>
          <p>
            This uses <code>@sepbase/sdk</code> synchronously in your browser. No RPC, wallet,
            attestation, payment, or write call is made.
          </p>
        </header>

        <div className={styles.inputGroup}>
          <label htmlFor={inputId}>RAW NAME INPUT</label>
          <input
            id={inputId}
            value={rawInput}
            onChange={(event) => {
              setRawInput(event.target.value);
              setConfirmedCanonicalLabel(null);
            }}
            aria-describedby={`${hintId} ${statusId}`}
            autoComplete="off"
            spellCheck={false}
          />
          <p id={hintId}>
            Enter one UTF-8 label or one label ending in <code>.{v3Manifest.suffix}</code>.
          </p>
        </div>

        {normalizerView.kind === "idle" ? (
          <div className={styles.idleState} id={statusId} role="status">
            Enter a name to derive the canonical label, labelhash, node, and token ID locally.
          </div>
        ) : null}

        {normalizerView.kind === "error" ? (
          <div className={styles.errorState} id={statusId} role="alert">
            <span>TYPED NORMALIZATION ERROR / {normalizerView.code}</span>
            <strong>INPUT IS NOT READY</strong>
            <p>{normalizerView.message}</p>
            {normalizerView.normalizedSuggestion ? (
              <p>Canonical suggestion: <code>{normalizerView.normalizedSuggestion}</code></p>
            ) : null}
          </div>
        ) : null}

        {normalized ? (
          <>
            <div
              className={confirmationRequired ? styles.reviewRequired : styles.reviewReady}
              id={statusId}
              role="status"
              aria-live="polite"
            >
              <span>{confirmationRequired ? "CANONICAL CHANGE DETECTED" : "LOCAL DERIVATION READY"}</span>
              <strong>
                {confirmationRequired
                  ? "CONFIRM THE CANONICAL OUTPUT"
                  : canonicalChanged
                    ? "CANONICAL OUTPUT CONFIRMED"
                    : "INPUT ALREADY CANONICAL"}
              </strong>
              <p>
                {confirmationRequired
                  ? "The raw input is not ready for a future signing flow until you explicitly accept the canonical label below."
                  : "This local result is ready for inspection only; it is not a registration, attestation, or deployment proof."}
              </p>
            </div>

            <dl className={styles.normalizedValues}>
              <div>
                <dt>RAW INPUT</dt>
                <dd><code>{rawInput}</code></dd>
              </div>
              <div className={styles.primaryValue}>
                <dt>CANONICAL SUGGESTION</dt>
                <dd>
                  <output htmlFor={inputId}>{normalized.normalizedLabel}</output>
                  <span>{normalized.normalizedFullName}</span>
                </dd>
              </div>
              <div>
                <dt>LABELHASH</dt>
                <dd><code>{normalized.labelHash}</code></dd>
              </div>
              <div>
                <dt>NAMEHASH / RESOLVER NODE</dt>
                <dd><code>{normalized.node}</code></dd>
              </div>
              <div>
                <dt>TOKEN ID</dt>
                <dd><code>{normalized.tokenId.toString()}</code></dd>
              </div>
              <div>
                <dt>CANONICAL SIZE</dt>
                <dd>
                  <strong>{normalized.codePointLength} CODE POINTS</strong>
                  <span>{normalized.utf8ByteLength} UTF-8 bytes</span>
                </dd>
              </div>
            </dl>

            {confirmationRequired ? (
              <button
                className={styles.confirmButton}
                type="button"
                onClick={() => setConfirmedCanonicalLabel(normalized.normalizedLabel)}
              >
                Confirm canonical label “{normalized.normalizedLabel}”
              </button>
            ) : null}

            {canonicalChanged && locallyReady ? (
              <p className={styles.confirmedNote}>
                Canonical suggestion explicitly confirmed for this local review. Editing the raw
                input clears confirmation.
              </p>
            ) : null}
          </>
        ) : null}

        <footer className={styles.safetyFooter}>
          <strong>{releaseBoundary.title}</strong>
          <p>{releaseBoundary.detail}</p>
        </footer>
      </article>
    </div>
  );
}
