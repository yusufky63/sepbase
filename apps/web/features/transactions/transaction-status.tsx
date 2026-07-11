"use client";

import { Check, ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react";
import { projectConfig } from "@/config/project.config";
import { protocolErrorMessage } from "@/lib/errors";
import styles from "./transactions.module.css";

type TransactionState = {
  hash: `0x${string}` | undefined;
  error: Error | null;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
};

export function TransactionStatus({ transaction }: { transaction: TransactionState }) {
  if (transaction.error) {
    return (
      <div className={`${styles.notice} ${styles.error}`} role="alert">
        <TriangleAlert size={18} aria-hidden="true" />
        <span>{protocolErrorMessage(transaction.error)}</span>
      </div>
    );
  }
  if (transaction.isPending || transaction.isConfirming) {
    return (
      <div className={styles.notice} role="status">
        <LoaderCircle className={styles.spin} size={18} aria-hidden="true" />
        <span>{transaction.isPending ? "Confirm this request in your wallet." : "Waiting for chain confirmation."}</span>
      </div>
    );
  }
  if (transaction.isSuccess) {
    return (
      <div className={`${styles.notice} ${styles.success}`} role="status">
        <Check size={18} aria-hidden="true" />
        <span>Transaction confirmed.</span>
        {transaction.hash ? (
          <a
            href={`${projectConfig.chain.explorerUrl}/tx/${transaction.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    );
  }
  return null;
}
