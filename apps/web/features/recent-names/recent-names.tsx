"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { projectConfig } from "@/config/project.config";
import { protocolDeployed } from "@/lib/deployment-manifest";
import { formatDate, shortenAddress } from "@/lib/formatting";
import { useRecentNames } from "@/lib/contract/hooks";
import styles from "./recent-names.module.css";

export function RecentNames() {
  const { names, isLoading, isError } = useRecentNames(8);

  return (
    <div className={styles.list}>
      <div className={styles.headerRow}>
        <span>NAME</span>
        <span>OWNER</span>
        <span>REGISTERED</span>
        <span aria-hidden="true" />
      </div>
      {!protocolDeployed ? (
        <div className={styles.empty}>
          <span>PRE-DEPLOYMENT</span>
          <strong>Recent registrations will appear after launch.</strong>
        </div>
      ) : isLoading ? (
        <div className={styles.empty}>Loading recent registrations...</div>
      ) : isError ? (
        <div className={styles.empty}>Recent registrations could not be loaded.</div>
      ) : names.length === 0 ? (
        <div className={styles.empty}>No names have been registered yet.</div>
      ) : (
        names.map((name) => (
          <Link key={name.tokenId.toString()} href={`/name/${name.label}`} className={styles.row}>
            <strong>{name.label}<span>.{projectConfig.brand.suffix}</span></strong>
            <span>{shortenAddress(name.owner)}</span>
            <span>{formatDate(name.registeredAt)}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ))
      )}
    </div>
  );
}
