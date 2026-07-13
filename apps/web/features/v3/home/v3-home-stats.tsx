"use client";

import { useV3HomeSnapshot } from "./use-v3-home-snapshot";
import styles from "./v3-home-live.module.css";

type MetricState = "ready" | "attention" | "unavailable";

function metricValue(value: boolean, ready: string, attention: string) {
  return value ? attention : ready;
}

export function V3HomeStats() {
  const snapshot = useV3HomeSnapshot();
  const health = snapshot.data?.health;
  const ready = health?.status === "ready" ? health.value : null;
  const loading = snapshot.isPending;
  const metrics: Array<{ label: string; value: string; state: MetricState }> = ready
    ? [
        { label: "NAMES ONCHAIN", value: ready.nameCount.toLocaleString("en-US"), state: "ready" },
        {
          label: "REGISTRATIONS",
          value: metricValue(ready.registrationsPaused, "OPEN", "PAUSED"),
          state: ready.registrationsPaused ? "attention" : "ready",
        },
        {
          label: "MARKETPLACE",
          value: metricValue(ready.marketPaused, "OPEN", "PAUSED"),
          state: ready.marketPaused ? "attention" : "ready",
        },
        {
          label: "SETTLEMENT",
          value: ready.suiteSolvent ? "READY" : "REVIEW",
          state: ready.suiteSolvent ? "ready" : "attention",
        },
      ]
    : ["NAMES ONCHAIN", "REGISTRATIONS", "MARKETPLACE", "SETTLEMENT"].map((label) => ({
        label,
        value: loading ? "CHECKING" : "UNAVAILABLE",
        state: "unavailable" as const,
      }));

  return (
    <div className={styles.health}>
      <dl className={styles.metrics} aria-busy={loading}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metric} data-state={metric.state}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      {ready ? (
        <p className={styles.snapshot}>CONFIRMATION-PINNED BLOCK / {ready.blockNumber.toString()}</p>
      ) : !loading ? (
        <p className={styles.warning} role="alert">
          The V3 registry snapshot could not be verified. V2 metrics are not substituted.
        </p>
      ) : null}
    </div>
  );
}
