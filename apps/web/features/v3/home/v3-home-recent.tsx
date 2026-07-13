"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { shortenAddress } from "@/lib/formatting";
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
        <span aria-hidden="true" />
      </div>
      {snapshot.isPending ? (
        <div className={styles.empty} role="status">Loading recent names...</div>
      ) : !ready ? (
        <div className={styles.empty} role="alert">
          Recent names could not be loaded.
        </div>
      ) : ready.items.length === 0 ? (
        <div className={styles.empty}>
          <span>RECENT NAMES</span>
          <strong>No recent names are available yet.</strong>
        </div>
      ) : ready.items.map((name) => (
        <Link
          key={name.tokenId.toString()}
          href={`/name/${encodeURIComponent(name.label)}`}
          className={styles.row}
        >
          <strong>{name.label}<span>.{name.fullName.slice(name.label.length + 1)}</span></strong>
          <span>{shortenAddress(name.owner)}</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
