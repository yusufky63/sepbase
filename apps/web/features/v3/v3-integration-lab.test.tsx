import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { V3IntegrationLab } from "./v3-integration-lab";

afterEach(cleanup);

describe("V3IntegrationLab", () => {
  it("presents the manifest as a draft source artifact without operational claims", () => {
    render(<V3IntegrationLab />);

    expect(screen.getByText("DRAFT / CURRENT SOURCE STATE")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("CANDIDATE / NOT CURRENT")).toBeInTheDocument();
    expect(screen.getByText("LIVE / NOT CURRENT")).toBeInTheDocument();
    expect(screen.getAllByText("ADDRESS NULL / NOT DEPLOYED")).toHaveLength(7);
    expect(screen.getByText("FALSE / DISABLED")).toBeInTheDocument();
    expect(screen.getByText(/No RPC, wallet, attestation, payment, or write call is made/i)).toBeInTheDocument();
    expect(screen.getByText(/never requests V3 chain state while all seven manifest addresses are null/i)).toBeInTheDocument();
  });

  it("derives the same identity for composed and decomposed Unicode", async () => {
    const user = userEvent.setup();
    render(<V3IntegrationLab />);
    const input = screen.getByRole("textbox", { name: "RAW NAME INPUT" });

    await user.clear(input);
    await user.type(input, "é");
    const composedLabelHash = screen.getByText("LABELHASH").nextElementSibling?.textContent;
    const composedNode = screen.getByText("NAMEHASH / RESOLVER NODE").nextElementSibling?.textContent;
    const composedTokenId = screen.getByText("TOKEN ID").nextElementSibling?.textContent;

    expect(screen.getByText("LOCAL DERIVATION READY")).toBeInTheDocument();
    expect(screen.getAllByText("é")).not.toHaveLength(0);

    await user.clear(input);
    await user.type(input, "é");

    expect(screen.getByText("CANONICAL CHANGE DETECTED")).toBeInTheDocument();
    expect(screen.queryByText("LOCAL DERIVATION READY")).not.toBeInTheDocument();
    expect(screen.getByText("LABELHASH").nextElementSibling?.textContent).toBe(composedLabelHash);
    expect(screen.getByText("NAMEHASH / RESOLVER NODE").nextElementSibling?.textContent).toBe(composedNode);
    expect(screen.getByText("TOKEN ID").nextElementSibling?.textContent).toBe(composedTokenId);
  });

  it("requires explicit confirmation when canonical output changes and clears it on edit", async () => {
    const user = userEvent.setup();
    render(<V3IntegrationLab />);
    const input = screen.getByRole("textbox", { name: "RAW NAME INPUT" });

    await user.clear(input);
    await user.type(input, "é");
    expect(screen.queryByText("LOCAL DERIVATION READY")).not.toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: "Confirm canonical label “é”" });
    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("LOCAL DERIVATION READY")).toBeInTheDocument();
    expect(screen.getByText(/explicitly confirmed for this local review/i)).toBeInTheDocument();

    await user.type(input, "x");
    expect(screen.getByText("CANONICAL CHANGE DETECTED")).toBeInTheDocument();
    expect(screen.queryByText(/explicitly confirmed for this local review/i)).not.toBeInTheDocument();
  });

  it("shows a typed invalid state for a mixed-script confusable", async () => {
    const user = userEvent.setup();
    render(<V3IntegrationLab />);
    const input = screen.getByRole("textbox", { name: "RAW NAME INPUT" });

    await user.clear(input);
    await user.type(input, "раypal");

    expect(screen.getByRole("alert")).toHaveTextContent("TYPED NORMALIZATION ERROR / INVALID_NAME");
    expect(screen.getByText("INPUT IS NOT READY")).toBeInTheDocument();
    expect(screen.queryByText("LOCAL DERIVATION READY")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm canonical label/i })).not.toBeInTheDocument();
  });
});
