"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { IconButton } from "./button";
import styles from "./ui.module.css";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  critical?: boolean;
};

export function Dialog({ open, onClose, title, description, children, critical = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onCancel={(event) => {
        if (critical) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (!critical && event.target === ref.current) onClose();
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.moduleLabel}>TRANSACTION</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
