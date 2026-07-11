"use client";

import { useState } from "react";
import { Activity, ChartNoAxesCombined, LockKeyhole, Settings2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { WalletButton } from "@/components/wallet/wallet-button";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest, protocolDeployed } from "@/lib/deployment-manifest";
import { shortenAddress } from "@/lib/formatting";
import { AdminActivity } from "./admin-activity";
import { AdminControls } from "./admin-controls";
import { useAdminAccess, useAdminActivity, useAdminOverview } from "./admin-hooks";
import { AdminOverview } from "./admin-overview";
import styles from "./admin-workspace.module.css";

export type AdminTab = "overview" | "activity" | "controls";

export function AdminWorkspace({ initialTab }: { initialTab: AdminTab }) {
  const access = useAdminAccess();

  if (!protocolDeployed) return <AdminGate state="unavailable" />;
  if (!access.isConnected) return <AdminGate state="connect" />;
  if (access.isWrongNetwork) return <AdminGate state="network" account={access.account} />;
  if (access.isLoading) return <AdminGate state="loading" account={access.account} />;
  if (!access.isAuthorized) return <AdminGate state="denied" account={access.account} />;

  return <AuthorizedAdminWorkspace initialTab={initialTab} access={access} />;
}

type AccessState = ReturnType<typeof useAdminAccess>;

function AuthorizedAdminWorkspace({ initialTab, access }: { initialTab: AdminTab; access: AccessState }) {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const overview = useAdminOverview(true);
  const activity = useAdminActivity(true);
  const setActiveTab = (next: AdminTab) => {
    setTab(next);
    router.replace(next === "overview" ? projectConfig.admin.path : `${projectConfig.admin.path}?tab=${next}`, { scroll: false });
  };
  const roleLabel = access.role === "owner" ? "CONTRACT OWNER" : access.role === "pending-owner" ? "PENDING OWNER" : "AUTHORIZED VIEWER";

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.kicker}>ADMIN ACCESS / {deploymentManifest.chainName.toUpperCase()}</div>
        <div className={styles.heroGrid}>
          <h1><span>ADMIN</span><strong>OPS/</strong></h1>
          <div className={styles.accessIdentity}>
            <LockKeyhole size={20} aria-hidden="true" />
            <span>{roleLabel}</span>
            <strong>{access.account ? shortenAddress(access.account, 6) : ""}</strong>
          </div>
        </div>
        <p className={styles.heroCopy}>Live contract state, recorded activity, and owner-authorized operations.</p>
      </section>

      <nav className={styles.workspaceTabs} aria-label="Admin workspace" role="tablist">
        <button id="admin-tab-overview" aria-controls="admin-tabpanel" role="tab" aria-selected={tab === "overview"} onClick={() => setActiveTab("overview")}><span>01</span><ChartNoAxesCombined size={18} aria-hidden="true" />Overview</button>
        <button id="admin-tab-activity" aria-controls="admin-tabpanel" role="tab" aria-selected={tab === "activity"} onClick={() => setActiveTab("activity")}><span>02</span><Activity size={18} aria-hidden="true" />Activity</button>
        <button id="admin-tab-controls" aria-controls="admin-tabpanel" role="tab" aria-selected={tab === "controls"} onClick={() => setActiveTab("controls")}><span>03</span><Settings2 size={18} aria-hidden="true" />Controls</button>
      </nav>

      <section id="admin-tabpanel" className={styles.workspacePanel} role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
        {tab === "overview" ? <AdminOverview overview={overview} activity={activity} /> : null}
        {tab === "activity" ? <AdminActivity activity={activity} /> : null}
        {tab === "controls" ? <AdminControls isOwner={access.isOwner} isPendingOwner={access.isPendingOwner} overview={overview} /> : null}
      </section>
    </div>
  );
}

type GateState = "connect" | "network" | "loading" | "denied" | "unavailable";

function AdminGate({ state, account }: { state: GateState; account?: `0x${string}` | undefined }) {
  const copy = {
    connect: ["WALLET REQUIRED", "Connect an authorized wallet.", "The admin workspace opens only for the live contract owner, pending owner, or configured viewer addresses."],
    network: ["NETWORK REQUIRED", `Switch to ${deploymentManifest.chainName}.`, "Admin reads and transactions are scoped to the configured deployment network."],
    loading: ["CHECKING ACCESS", "Verifying contract permissions.", "The connected address is being compared with live owner state and the configured viewer list."],
    denied: ["ACCESS DENIED", "This wallet is not authorized.", "Disconnect and connect an address permitted for this admin workspace."],
    unavailable: ["ADMIN UNAVAILABLE", "No contract deployment is configured.", "Publish a validated deployment manifest before opening administration."],
  }[state];
  return (
    <section className={styles.gate} aria-labelledby="admin-gate-title">
      <div className={styles.gateIndex}>A/01</div>
      <ShieldAlert size={34} aria-hidden="true" />
      <span>{copy[0]}</span>
      <h1 id="admin-gate-title">{copy[1]}</h1>
      <p>{copy[2]}</p>
      {account ? <code>{account}</code> : null}
      {state === "connect" || state === "network" || state === "denied" ? <WalletButton /> : null}
    </section>
  );
}
