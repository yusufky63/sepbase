"use client";

import { CalendarClock, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/button";
import {
  dismissRenewalReminder,
  nextDueRenewalReminder,
  parseRenewalRemindersSnapshot,
  removeRenewalReminder,
  renewalRemindersSnapshot,
  subscribeRenewalReminders,
} from "@/lib/renewal-reminders";
import styles from "./renewal.module.css";

export function RenewalReminderCenter() {
  const [now, setNow] = useState(0);
  const snapshot = useSyncExternalStore(subscribeRenewalReminders, renewalRemindersSnapshot, () => "[]");
  const reminders = useMemo(() => parseRenewalRemindersSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);

  const due = now === 0 ? null : nextDueRenewalReminder(reminders, now);
  if (!due) return null;

  return (
    <aside className={styles.reminder} role="status" aria-live="polite">
      <CalendarClock className={styles.reminderIcon} size={22} aria-hidden="true" />
      <div className={styles.reminderCopy}>
        <span>RENEWAL WATCH / {due.timing.urgency.toUpperCase()}</span>
        <strong>{due.item.fullName}</strong>
        <p>{due.timing.label}</p>
        <div className={styles.reminderActions}>
          <Link href={`/name/${encodeURIComponent(due.item.label)}`}>Open name</Link>
          <button type="button" onClick={() => removeRenewalReminder(due.item.tokenId)}>Stop watching</button>
        </div>
      </div>
      <IconButton
        label="Dismiss renewal reminder for 24 hours"
        className={styles.reminderDismiss}
        onClick={() => dismissRenewalReminder(due.item.tokenId, Date.now() + 86_400_000)}
      >
        <X size={18} aria-hidden="true" />
      </IconButton>
    </aside>
  );
}
