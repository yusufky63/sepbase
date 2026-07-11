"use client";

import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { formatBps, formatSettlementAmount } from "@/lib/settlement";
import type { AdminActivityData } from "./admin-data";
import type { AdminOverviewState } from "./admin-hooks";
import styles from "./admin-workspace.module.css";

type AdminOverviewProps = {
  overview: AdminOverviewState;
  activity: UseQueryResult<AdminActivityData, Error>;
};

function amount(value: bigint): string {
  return `${formatSettlementAmount(value, deploymentManifest.settlement.decimals)} ${deploymentManifest.settlement.symbol}`;
}

export function AdminOverview({ overview, activity }: AdminOverviewProps) {
  if (overview.isLoading) return <div className={styles.loadingState} role="status">Loading live contract state...</div>;
  if (overview.error) return <div className={styles.errorState} role="alert"><AlertTriangle size={20} aria-hidden="true" />Contract state could not be loaded.</div>;

  const summary = activity.data?.summary;
  const graceDays = Number(overview.gracePeriod / 86_400n);
  const metrics = [
    ["ACTIVE NAMES", overview.totalSupply.toString()],
    ["ACTIVE LISTINGS", overview.totalListings.toString()],
    ["CONTRACT BALANCE", amount(overview.settlementBalance)],
    ["TREASURY AVAILABLE", amount(overview.treasuryAvailableBalance)],
    ["PROTECTED BALANCE", amount(overview.totalProtectedLiability)],
    ["REFERRAL LIABILITY", amount(overview.totalReferralLiability)],
    ["SELLER LIABILITY", amount(overview.totalMarketplaceLiability)],
    ["ANNUAL RATE", amount(overview.annualPrice)],
  ] as const;
  const lifetime = [
    ["REGISTRATIONS", summary?.registrations.toString() ?? "..."],
    ["RENEWALS", summary?.renewals.toString() ?? "..."],
    ["LISTINGS CREATED", summary?.listings.toString() ?? "..."],
    ["MARKET SALES", summary?.sales.toString() ?? "..."],
    ["SALE VOLUME", summary ? amount(summary.saleVolume) : "..."],
    ["REFERRAL REWARDS", summary ? amount(summary.referralRewards) : "..."],
    ["TREASURY WITHDRAWN", summary ? amount(summary.treasuryWithdrawn) : "..."],
    ["INDEXED EVENTS", summary?.totalEvents.toString() ?? "..."],
  ] as const;

  return (
    <div className={styles.overview}>
      <section className={styles.healthBand} aria-label="Protocol status">
        <div className={styles.healthPrimary} data-healthy={overview.solvent}>
          {overview.solvent ? <CheckCircle2 size={28} aria-hidden="true" /> : <AlertTriangle size={28} aria-hidden="true" />}
          <div><span>PROTOCOL HEALTH</span><strong>{overview.solvent ? "SOLVENT" : "ACTION REQUIRED"}</strong></div>
        </div>
        <div><span>REGISTRATIONS</span><strong>{overview.registrationsPaused ? "PAUSED" : "LIVE"}</strong></div>
        <div><span>MARKETPLACE</span><strong>{overview.marketplacePaused ? "PAUSED" : "LIVE"}</strong></div>
        <div><span>VERSION</span><strong>{overview.version}</strong></div>
      </section>

      <section className={styles.metricSection} aria-labelledby="current-state-heading">
        <header><span>01 / NOW</span><h2 id="current-state-heading">Current contract state</h2></header>
        <div className={styles.metricGrid}>
          {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>

      <section className={styles.metricSection} aria-labelledby="lifetime-heading">
        <header><span>02 / SINCE DEPLOYMENT</span><h2 id="lifetime-heading">Recorded activity</h2></header>
        <div className={styles.metricGrid}>
          {lifetime.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
        {activity.isError ? <p className={styles.inlineWarning}>Event totals are temporarily unavailable; current contract balances remain live.</p> : null}
      </section>

      <section className={styles.detailSection} aria-labelledby="configuration-heading">
        <header><span>03 / CONFIGURATION</span><h2 id="configuration-heading">Deployment details</h2></header>
        <dl className={styles.detailGrid}>
          <div><dt>CONTRACT</dt><dd>{protocolAddress ?? "Not deployed"}{protocolAddress ? <a href={`${projectConfig.chain.explorerUrl}/address/${protocolAddress}`} target="_blank" rel="noreferrer" aria-label="Open contract in explorer"><ExternalLink size={15} aria-hidden="true" /></a> : null}</dd></div>
          <div><dt>OWNER</dt><dd>{overview.owner ?? "Unavailable"}</dd></div>
          <div><dt>PENDING OWNER</dt><dd>{overview.pendingOwner ?? "None"}</dd></div>
          <div><dt>TREASURY</dt><dd>{overview.treasury ?? "Unavailable"}</dd></div>
          <div><dt>SETTLEMENT</dt><dd>{deploymentManifest.settlement.symbol} / {deploymentManifest.settlement.kind.toUpperCase()} / {deploymentManifest.settlement.decimals} DECIMALS</dd></div>
          <div><dt>GAS CURRENCY</dt><dd>{deploymentManifest.nativeCurrency.symbol}</dd></div>
          <div><dt>REFERRAL RATE</dt><dd>{formatBps(overview.referralRewardBps)}</dd></div>
          <div><dt>MARKET FEE</dt><dd>{formatBps(overview.marketplaceFeeBps)}</dd></div>
          <div><dt>GRACE PERIOD</dt><dd>{graceDays} DAYS</dd></div>
          <div><dt>DEPLOYMENT BLOCK</dt><dd>{deploymentManifest.deploymentBlock ?? "Unavailable"}</dd></div>
          <div className={styles.detailWide}><dt>METADATA BASE URL</dt><dd>{overview.metadataBaseURI}</dd></div>
        </dl>
      </section>
    </div>
  );
}
