import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

describe("Dialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: vi.fn(function close(this: HTMLDialogElement) {
        this.removeAttribute("open");
      }),
    });
  });

  it("allows Escape to close a critical dialog while ignoring backdrop clicks", () => {
    const onClose = vi.fn();
    render(
      <Dialog open critical title="Confirm purchase" description="Review the transaction." onClose={onClose}>
        <button type="button">Confirm</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    const cancelEvent = new Event("cancel", { bubbles: true, cancelable: true });
    fireEvent(dialog, cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes a non-critical dialog from a backdrop click", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Wallet" description="Choose a wallet." onClose={onClose}>
        <button type="button">Continue</button>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
