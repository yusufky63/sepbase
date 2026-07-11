import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransactionComplete } from "./transaction-complete";

describe("TransactionComplete", () => {
  it("keeps confirmation visible and exposes contextual next actions", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const hash = `0x${"1".repeat(64)}` as `0x${string}`;
    render(
      <TransactionComplete
        hash={hash}
        title="Name listed"
        message="alice.sepbase is confirmed on the market."
        primaryLabel="Open market"
        onPrimary={onPrimary}
        secondaryLabel="Close"
        onSecondary={onSecondary}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Name listed");
    expect(screen.getByRole("link", { name: /view transaction/i })).toHaveAttribute("href", expect.stringContaining(hash));
    fireEvent.click(screen.getByRole("button", { name: "Open market" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onPrimary).toHaveBeenCalledOnce();
    expect(onSecondary).toHaveBeenCalledOnce();
  });
});
