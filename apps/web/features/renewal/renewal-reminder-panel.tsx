"use client";

import { BellRing, CalendarPlus, Check } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { projectConfig } from "@/config/project.config";
import { formatDate } from "@/lib/formatting";
import {
  buildRenewalCalendar,
  loadRenewalReminders,
  parseRenewalRemindersSnapshot,
  removeRenewalReminder,
  renewalRemindersSnapshot,
  renewalTiming,
  saveRenewalReminder,
  subscribeRenewalReminders,
} from "@/lib/renewal-reminders";
import { NAME_STATUS, type NameRecord } from "@/lib/contract/types";
import styles from "./renewal.module.css";

function downloadCalendar(record: NameRecord) {
  if (!record.expiresAt) return;
  const fullName = `${record.label}.${projectConfig.brand.suffix}`;
  const calendar = buildRenewalCalendar({
    tokenId: record.tokenId.toString(),
    label: record.label,
    fullName,
    expiresAt: record.expiresAt.toString(),
  });
  const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.label}-${projectConfig.brand.suffix}-renewal.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export function RenewalReminderPanel({ record }: { record: NameRecord }) {
  const eligible = (record.status === NAME_STATUS.ACTIVE || record.status === NAME_STATUS.GRACE)
    && record.expiresAt !== null
    && record.expiresAt > 0n;
  const tokenId = record.tokenId.toString();
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);
  const snapshot = useSyncExternalStore(subscribeRenewalReminders, renewalRemindersSnapshot, () => "[]");
  const reminders = useMemo(() => parseRenewalRemindersSnapshot(snapshot), [snapshot]);
  const saved = reminders.some((item) => item.tokenId === tokenId);

  useEffect(() => {
    if (!eligible) return;
    const initial = window.setTimeout(() => setNowSeconds(Math.floor(Date.now() / 1000)), 0);
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [eligible]);

  useEffect(() => {
    if (!eligible || !saved || !record.expiresAt) return;
    const current = loadRenewalReminders().find((item) => item.tokenId === tokenId);
    if (current?.expiresAt === record.expiresAt.toString()) return;
    saveRenewalReminder({
      tokenId,
      label: record.label,
      fullName: `${record.label}.${projectConfig.brand.suffix}`,
      expiresAt: record.expiresAt.toString(),
    });
  }, [eligible, record.expiresAt, record.label, saved, tokenId]);

  if (!eligible || !record.expiresAt) return null;
  const timing = nowSeconds === null ? null : renewalTiming(record.expiresAt, nowSeconds);

  function toggleWatch() {
    if (saved) {
      removeRenewalReminder(tokenId);
      return;
    }
    saveRenewalReminder({
      tokenId,
      label: record.label,
      fullName: `${record.label}.${projectConfig.brand.suffix}`,
      expiresAt: record.expiresAt!.toString(),
    });
  }

  return (
    <section className={styles.watchSection} aria-labelledby="renewal-watch-title">
      <div className={styles.inner}>
        <div className={styles.watchHeading}>
          <span>03 / RENEWAL WATCH</span>
          <h2 id="renewal-watch-title">Keep this name active.</h2>
        </div>
        <div className={styles.watchRail}>
          <div>
            <span>EXPIRY</span>
            <strong>{formatDate(record.expiresAt)}</strong>
          </div>
          <div>
            <span>WINDOW</span>
            <strong>{timing?.label ?? "Checking date"}</strong>
          </div>
          <div>
            <span>DEVICE WATCH</span>
            <strong>{saved ? "ACTIVE" : "OFF"}</strong>
          </div>
          <div className={styles.watchActions}>
            <Button
              variant={saved ? "secondary" : "primary"}
              icon={saved ? <Check size={17} /> : <BellRing size={17} />}
              onClick={toggleWatch}
            >
              {saved ? "Watching" : "Watch renewal"}
            </Button>
            <Button variant="quiet" icon={<CalendarPlus size={17} />} onClick={() => downloadCalendar(record)}>
              Calendar
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
