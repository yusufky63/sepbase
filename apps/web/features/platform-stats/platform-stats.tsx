"use client";

import { protocolDeployed } from "@/lib/deployment-manifest";
import { useProtocolHealth } from "@/lib/contract/hooks";
import styles from "./platform-stats.module.css";

type MetricState = "ready" | "attention" | "unavailable";

export function formatPlatformCount(value: bigint | null) {
  return value === null ? "--" : value.toLocaleString("en-US");
}

function availabilityLabel(paused: boolean, unavailable: boolean) {
  if (!protocolDeployed) return "PENDING";
  if (unavailable) return "UNAVAILABLE";
  return paused ? "PAUSED" : "OPEN";
}

function availabilityState(paused: boolean, unavailable: boolean): MetricState {
  if (!protocolDeployed || unavailable) return "unavailable";
  return paused ? "attention" : "ready";
}

export function PlatformStats() {
  const health = useProtocolHealth();
  const unavailable = health.isError || (!health.isLoading && health.nameCount === null);
  const loading = health.isLoading && protocolDeployed;
  const paymentLabel = !protocolDeployed
    ? "PENDING"
    : unavailable
      ? "UNAVAILABLE"
      : health.solvent
        ? "READY"
        : "REVIEW";
  const paymentState: MetricState = !protocolDeployed || unavailable
    ? "unavailable"
    : health.solvent
      ? "ready"
      : "attention";

  const metrics: Array<{ label: string; value: string; state: MetricState }> = [
    {
      label: "NAMES ONCHAIN",
      value: loading ? "--" : formatPlatformCount(health.nameCount),
      state: unavailable ? "unavailable" : "ready",
    },
    {
      label: "REGISTRATIONS",
      value: loading ? "CHECKING" : availabilityLabel(health.registrationsPaused, unavailable),
      state: availabilityState(health.registrationsPaused, unavailable),
    },
    {
      label: "MARKETPLACE",
      value: loading ? "CHECKING" : availabilityLabel(health.marketplacePaused, unavailable),
      state: availabilityState(health.marketplacePaused, unavailable),
    },
    {
      label: "PAYMENTS",
      value: loading ? "CHECKING" : paymentLabel,
      state: paymentState,
    },
  ];

  return (
    <dl className={styles.grid} aria-busy={loading}>
      {metrics.map((metric) => (
        <div key={metric.label} className={styles.metric} data-state={metric.state}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}
