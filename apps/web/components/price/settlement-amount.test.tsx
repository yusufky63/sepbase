import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettlementAmount } from "./settlement-amount";

describe("SettlementAmount asset overrides", () => {
  it("formats a V3 six-decimal asset without inheriting V2 fiat references", () => {
    render(
      <SettlementAmount
        amountBaseUnits={500n}
        settlement={{ decimals: 6, symbol: "USDC" }}
      />,
    );

    expect(screen.getByText("0.0005 USDC")).toBeInTheDocument();
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument();
  });
});
