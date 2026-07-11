"use client";

import { CircleCheck, CircleDashed, CircleSlash2, Clock3, ExternalLink } from "lucide-react";
import { Nameplate } from "@/components/nameplate/nameplate";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { projectConfig } from "@/config/project.config";
import { RenewalReminderPanel } from "@/features/renewal/renewal-reminder-panel";
import { deploymentManifest } from "@/lib/deployment-manifest";
import { formatDate, shortenAddress } from "@/lib/formatting";
import { safeHttpsUrl, socialProfileUrl } from "@/lib/profile";
import { useNameRecord } from "@/lib/contract/hooks";
import { NAME_STATUS } from "@/lib/contract/types";
import { NameActions } from "./name-actions";
import styles from "./name-workspace.module.css";

function statusLabel(status: number, reserved: boolean) {
  if (reserved && (status === NAME_STATUS.UNREGISTERED || status === NAME_STATUS.RELEASED)) return "RESERVED";
  if (status === NAME_STATUS.ACTIVE) return "ACTIVE";
  if (status === NAME_STATUS.GRACE) return "GRACE / RENEWAL";
  if (status === NAME_STATUS.RELEASED) return "RELEASED / AVAILABLE";
  return "AVAILABLE";
}

function profileHref(field: "website" | "twitter" | "github", value: string) {
  if (field === "website") return safeHttpsUrl(value);
  return socialProfileUrl(field, value);
}

function explorerAddressHref(address: string) {
  return `${deploymentManifest.explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

export function NameWorkspace({ label }: { label: string }) {
  const { record, isLoading, isError, isPreview, refetch } = useNameRecord(label);
  const status = statusLabel(record.status, record.reserved);
  const statusIcon = record.reserved
    ? <CircleSlash2 size={18} />
    : record.status === NAME_STATUS.ACTIVE
      ? <CircleCheck size={18} />
      : record.status === NAME_STATUS.GRACE
        ? <Clock3 size={18} />
        : <CircleDashed size={18} />;

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.breadcrumb}>NAME / {label.toUpperCase()} / {projectConfig.chain.name.toUpperCase()}</div>
          <div className={styles.nameTitle}>
            <h1>{label}<span>.{projectConfig.brand.suffix}</span></h1>
            <div className={styles.status}>{statusIcon}<span>{isLoading ? "LOADING" : isError ? "LOAD ERROR" : status}</span></div>
          </div>
          {isError ? <p className={styles.rpcError}>This name could not be loaded. It has not been marked unavailable. Try again.</p> : null}
          <NameActions record={record} isPreview={isPreview} onRecordRefresh={refetch} />
        </div>
      </section>

      <section className={styles.dataSection}>
        <div className={styles.inner}>
          <div className={styles.sectionHeading}><span>02 / NAME DETAILS</span><h2>Current name information</h2></div>
          <div className={styles.dataGrid}>
            <div>
              <span>OWNER</span>
              <strong>{record.owner ? (
                <a href={explorerAddressHref(record.owner)} target="_blank" rel="noopener noreferrer">
                  {shortenAddress(record.owner, 6)}<ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : "Not registered"}</strong>
            </div>
            <div>
              <span>RESOLUTION</span>
              <strong>{record.resolvedAddress ? (
                <a href={explorerAddressHref(record.resolvedAddress)} target="_blank" rel="noopener noreferrer">
                  {shortenAddress(record.resolvedAddress, 6)}<ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : "Not set"}</strong>
            </div>
            <div><span>EXPIRY</span><strong>{record.expiresAt ? formatDate(record.expiresAt) : "-"}</strong></div>
            <div><span>ANNUAL PRICE</span><strong><SettlementAmount amountBaseUnits={record.oneYearQuote} /></strong></div>
            <div><span>NETWORK</span><strong>{projectConfig.chain.name}</strong></div>
            <div><span>LISTING</span><strong>{record.listing ? <SettlementAmount amountBaseUnits={record.listing.price} /> : "Not listed"}</strong></div>
          </div>
        </div>
      </section>

      <RenewalReminderPanel record={record} />

      <section className={styles.identitySection}>
        <div className={styles.inner}>
          <div className={styles.sectionHeadingInverse}><span>04 / IDENTITY</span><h2>{record.profile.displayName || label}</h2></div>
          <div className={styles.identityGrid}>
            <Nameplate label={label} status={`IDENTITY / ${status}`} inverted />
            <div className={styles.profile}>
              <p>{record.profile.bio || "No public bio has been set for this name."}</p>
              {(["website", "twitter", "github"] as const).map((field) => {
                const value = record.profile[field];
                if (!value) return null;
                const href = profileHref(field, value);
                const label = field === "twitter" ? "X" : field.toUpperCase();
                return href ? (
                  <a key={field} href={href} target="_blank" rel="noopener noreferrer">
                    <span>{label}</span>{value}<ExternalLink size={14} />
                  </a>
                ) : (
                  <div className={styles.profileValue} key={field}>
                    <span>{label}</span>{value}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
