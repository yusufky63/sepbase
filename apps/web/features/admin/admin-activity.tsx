"use client";

import { useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw, Search, TriangleAlert } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { IconButton, Button } from "@/components/ui/button";
import { projectConfig } from "@/config/project.config";
import { adminActivityCategories, type AdminActivityCategory, type AdminActivityData } from "./admin-data";
import styles from "./admin-workspace.module.css";

const categoryLabels: Record<AdminActivityCategory, string> = {
  all: "All",
  names: "Names",
  market: "Market",
  referrals: "Referrals",
  treasury: "Treasury",
  configuration: "Configuration",
};

function formatTimestamp(value: bigint | null): string {
  if (value === null) return `Confirmed on ${projectConfig.chain.name}`;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(Number(value) * 1000);
}

function timestampDateTime(value: bigint | null): string | undefined {
  return value === null ? undefined : new Date(Number(value) * 1000).toISOString();
}

function shortenHash(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function AdminActivity({ activity }: { activity: UseQueryResult<AdminActivityData, Error> }) {
  const [category, setCategory] = useState<AdminActivityCategory>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(projectConfig.admin.activityPageSize);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (activity.data?.events ?? []).filter((event) => {
      if (category !== "all" && event.category !== category) return false;
      if (!normalized) return true;
      return `${event.eventName} ${event.title} ${event.description} ${event.transactionHash}`.toLowerCase().includes(normalized);
    });
  }, [activity.data?.events, category, query]);

  if (activity.isLoading) return <div className={styles.loadingState} role="status"><LoaderCircle className={styles.spin} size={20} aria-hidden="true" />Reading contract activity...</div>;
  if (activity.isError) return <div className={styles.errorState} role="alert"><TriangleAlert size={20} aria-hidden="true" />Activity could not be loaded from the configured network.</div>;

  return (
    <div className={styles.activity}>
      <section className={styles.activityToolbar} aria-label="Activity filters">
        <div className={styles.activitySearch}>
          <Search size={18} aria-hidden="true" />
          <label className="srOnly" htmlFor="admin-activity-search">Filter contract activity</label>
          <input id="admin-activity-search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(projectConfig.admin.activityPageSize); }} placeholder="Filter events, addresses, or transactions" />
        </div>
        <IconButton label="Refresh activity" onClick={() => void activity.refetch()} disabled={activity.isFetching}>
          <RefreshCw className={activity.isFetching ? styles.spin : ""} size={18} aria-hidden="true" />
        </IconButton>
      </section>

      <div className={styles.categoryTabs} role="group" aria-label="Activity category">
        {adminActivityCategories.map((item) => (
          <button key={item} aria-pressed={category === item} onClick={() => { setCategory(item); setLimit(projectConfig.admin.activityPageSize); }}>
            {categoryLabels[item]}
          </button>
        ))}
      </div>

      <div className={styles.activityMeta}>
        <span>{filtered.length} MATCHING EVENTS</span>
        <span>BLOCKS {activity.data?.scannedFromBlock.toString()} - {activity.data?.scannedToBlock.toString()}</span>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyActivity}><span>NO MATCHES</span><h2>No contract events match this view.</h2></div>
      ) : (
        <ol className={styles.activityList}>
          {filtered.slice(0, limit).map((event, index) => (
            <li key={event.id}>
              <div className={styles.eventIndex}>{String(index + 1).padStart(2, "0")}</div>
              <div className={styles.eventMain}>
                <div><span>{event.category.toUpperCase()} / {event.eventName}</span><time dateTime={timestampDateTime(event.timestamp)}>{formatTimestamp(event.timestamp)}</time></div>
                <h3>{event.title}</h3>
                <p>{event.description}</p>
              </div>
              <div className={styles.eventTransaction}>
                <span>BLOCK {event.blockNumber.toString()}</span>
                <a href={`${projectConfig.chain.explorerUrl}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer" title={event.transactionHash} aria-label={`Open transaction ${event.transactionHash} in explorer`}>
                  {shortenHash(event.transactionHash)} <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ol>
      )}
      {filtered.length > limit ? <Button variant="secondary" className={styles.loadMore} onClick={() => setLimit((value) => value + projectConfig.admin.activityPageSize)}>Load more</Button> : null}
    </div>
  );
}
