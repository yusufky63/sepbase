"use client";

import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TransactionStatus } from "@/features/transactions/transaction-status";
import styles from "./admin-workspace.module.css";

export type AdminWrite = {
  functionName: string;
  args?: readonly unknown[];
};

export type AdminAction = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  details: readonly { label: string; value: string }[];
  write: AdminWrite;
};

type AdminTransaction = {
  hash: `0x${string}` | undefined;
  error: Error | null;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
};

type AdminActionDialogProps = {
  action: AdminAction | null;
  transaction: AdminTransaction;
  onClose: () => void;
  onConfirm: () => void;
};

export function AdminActionDialog({ action, transaction, onClose, onConfirm }: AdminActionDialogProps) {
  const busy = transaction.isPending || transaction.isConfirming;
  return (
    <Dialog
      open={action !== null}
      onClose={onClose}
      title={action?.title ?? "Confirm admin action"}
      description={action?.description ?? "Review this contract change before signing."}
      critical={busy}
    >
      {action ? (
        <div className={styles.confirmationBody}>
          <dl className={styles.confirmationGrid}>
            {action.details.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
          <TransactionStatus transaction={transaction} />
          <div className={styles.confirmationActions}>
            <Button variant="quiet" onClick={onClose} disabled={busy}>
              {transaction.isSuccess ? "Close" : "Cancel"}
            </Button>
            {!transaction.isSuccess ? (
              <Button
                variant={action.danger ? "danger" : "primary"}
                icon={busy ? undefined : <ShieldCheck size={17} aria-hidden="true" />}
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? "Processing..." : action.confirmLabel}
              </Button>
            ) : (
              <Button icon={<Check size={17} aria-hidden="true" />} onClick={onClose}>Done</Button>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
