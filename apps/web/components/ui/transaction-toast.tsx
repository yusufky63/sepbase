"use client";

import { CheckCircle2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconButton } from "./button";
import { consumeTransactionNotice, type TransactionNotice } from "@/lib/transaction-notice";
import styles from "./transaction-toast.module.css";

const autoDismissMs = 6_000;

export function TransactionToastView({
  notice,
  onDismiss,
}: {
  notice: TransactionNotice;
  onDismiss: () => void;
}) {
  return (
    <aside className={styles.toast} role="status" aria-live="polite" aria-atomic="true" aria-label="Transaction update">
      <CheckCircle2 className={styles.icon} size={25} aria-hidden="true" />
      <div className={styles.copy}>
        <span>MARKET UPDATE</span>
        <strong>{notice.title}</strong>
        <p>{notice.message}</p>
      </div>
      <IconButton label="Dismiss notification" className={styles.dismiss} onClick={onDismiss}>
        <X size={18} aria-hidden="true" />
      </IconButton>
    </aside>
  );
}

export function TransactionToast() {
  const pathname = usePathname();
  const [notice, setNotice] = useState<TransactionNotice | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextNotice = consumeTransactionNotice();
      if (nextNotice) setNotice(nextNotice);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return notice ? <TransactionToastView notice={notice} onDismiss={() => setNotice(null)} /> : null;
}
