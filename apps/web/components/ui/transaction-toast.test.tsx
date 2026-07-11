import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeTransactionNotice,
  createTransactionNotice,
  queueTransactionNotice,
  transactionNoticeStorageKey,
} from "@/lib/transaction-notice";
import { TransactionToastView } from "./transaction-toast";

describe("transaction notices", () => {
  beforeEach(() => sessionStorage.clear());

  it("queues a scoped notice and consumes it only once", () => {
    queueTransactionNotice("listed", "alice.sepbase", { storage: sessionStorage, now: 1_000 });
    expect(sessionStorage.getItem(transactionNoticeStorageKey)).not.toBeNull();
    expect(consumeTransactionNotice({ storage: sessionStorage, now: 2_000 })).toMatchObject({
      kind: "listed",
      name: "alice.sepbase",
      title: "Listing is live",
    });
    expect(consumeTransactionNotice({ storage: sessionStorage, now: 2_000 })).toBeNull();
  });

  it("rejects stale, malformed, and non-canonical notices", () => {
    queueTransactionNotice("purchased", "alice.sepbase", { storage: sessionStorage, now: 1_000 });
    expect(consumeTransactionNotice({ storage: sessionStorage, now: 700_001 })).toBeNull();
    sessionStorage.setItem(transactionNoticeStorageKey, "not-json");
    expect(consumeTransactionNotice({ storage: sessionStorage, now: 2_000 })).toBeNull();
    expect(createTransactionNotice("listed", "not-a-project-name")).toBeNull();
  });

  it("renders an accessible dismissible toast", () => {
    const onDismiss = vi.fn();
    const notice = createTransactionNotice("purchased", "alice.sepbase");
    expect(notice).not.toBeNull();
    render(<TransactionToastView notice={notice!} onDismiss={onDismiss} />);
    expect(screen.getByRole("status", { name: "Transaction update" })).toHaveTextContent("alice.sepbase has been added to your names.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
