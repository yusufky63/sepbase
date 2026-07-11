"use client";

import { ShieldAlert } from "lucide-react";
import { useDeploymentConsistency, useProtocolHealth } from "@/lib/contract/hooks";
import { protocolDeployed } from "@/lib/deployment-manifest";
import styles from "./protocol-banner.module.css";

export function ProtocolBanner() {
  const health = useProtocolHealth();
  const deployment = useDeploymentConsistency();
  if (!protocolDeployed || health.isLoading || deployment.isLoading) return null;
  if (!deployment.ready) {
    return (
      <div className={styles.banner} role="alert">
        <div>
          <ShieldAlert size={19} aria-hidden="true" />
          <strong>SERVICE CHECK IN PROGRESS</strong>
          <span>Transactions are temporarily unavailable while the service configuration is verified.</span>
        </div>
      </div>
    );
  }
  if (health.solvent) return null;
  return (
    <div className={styles.banner} role="alert">
      <div>
        <ShieldAlert size={19} aria-hidden="true" />
        <strong>PAYMENTS TEMPORARILY PAUSED</strong>
        <span>New payments are unavailable while balances are reviewed. Existing rewards and proceeds can still be claimed.</span>
      </div>
    </div>
  );
}
