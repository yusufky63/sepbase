"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { shortenAddress } from "@/lib/formatting";
import { V3_HOME_RECENT_BLOCK_WINDOW } from "./v3-home-data";
import { useV3HomeSnapshot } from "./use-v3-home-snapshot";
import styles from "./v3-home-live.module.css";

export function V3HomeRecentNames() {
  const snapshot = useV3HomeSnapshot();
  const recent = snapshot.data?.recent;
  const ready = recent?.status === "ready" ? recent.value : null;

  return (
    <div className={styles.recent}>
      <div className={styles.headerRow}>
        <span>NAME</span>
        <span>CURRENT OWNER</span>
        <span>REGISTRATION BLOCK</span>
        <span aria-hidden="true" />
      </div>
      {snapshot.isPending ? (
        <div className={styles.empty} role="status">Reading recent V3 registrations...</div>
      ) : !ready ? (
        <div className={styles.empty} role="alert">
          Recent V3 registrations are unavailable. V2 registration history is not shown here.
        </div>
      ) : ready.items.length === 0 ? (
        <div className={styles.empty}>
          <span>VERIFIED EMPTY WINDOW</span>
          <strong>
            {ready.eventCount === 0
              ? `No registration events were found from blocks ${ready.fromBlock.toString()} to ${ready.blockNumber.toString()}.`
              : `No current names were found among the latest ${ready.inspectedCount} unique registration candidates in this bounded window.`}
          </strong>
        </div>
      ) : ready.items.map((name) => (
        <Link
          key={name.tokenId.toString()}
          href={`/name/${encodeURIComponent(name.label)}`}
          className={styles.row}
        >
          <strong>{name.label}<span>.{name.fullName.slice(name.label.length + 1)}</span></strong>
          <span>{shortenAddress(name.owner)}</span>
          <span>{name.registrationBlock.toString()}</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      ))}
      {ready ? (
        <p className={styles.windowNote}>
          INDEXER-FREE / LATEST {V3_HOME_RECENT_BLOCK_WINDOW.toLocaleString("en-US")} CONFIRMED BLOCKS / {ready.eventCount.toLocaleString("en-US")} EVENTS / CURRENT STATE RECHECKED AT {ready.blockNumber.toString()}
        </p>
      ) : null}
    </div>
  );
}
