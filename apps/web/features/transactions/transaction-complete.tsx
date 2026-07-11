"use client";

import { ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectConfig } from "@/config/project.config";
import styles from "./transactions.module.css";

type TransactionCompleteProps = {
  hash: `0x${string}` | undefined;
  message: string;
  onPrimary: () => void;
  onSecondary?: (() => void) | undefined;
  primaryLabel: string;
  secondaryLabel?: string | undefined;
  title: string;
};

export function TransactionComplete({
  hash,
  message,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
  title,
}: TransactionCompleteProps) {
  return (
    <section className={styles.complete} role="status" aria-live="polite">
      <CheckCircle2 className={styles.completeIcon} size={32} aria-hidden="true" />
      <div>
        <span className={styles.completeLabel}>CONFIRMED / {projectConfig.chain.name.toUpperCase()}</span>
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      {hash ? (
        <a
          className={styles.transactionLink}
          href={`${projectConfig.chain.explorerUrl}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction <ExternalLink size={14} aria-hidden="true" />
        </a>
      ) : null}
      <div className={styles.completeActions}>
        {onSecondary && secondaryLabel ? (
          <Button variant="quiet" onClick={onSecondary}>{secondaryLabel}</Button>
        ) : null}
        <Button icon={<ArrowRight size={17} aria-hidden="true" />} onClick={onPrimary}>{primaryLabel}</Button>
      </div>
    </section>
  );
}
