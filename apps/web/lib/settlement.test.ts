import { describe, expect, it } from "vitest";
import { formatSettlementAmount, parseSettlementAmount } from "./settlement";

describe("settlement utilities", () => {
  it.each([
    ["1.25", 6, 1_250_000n],
    ["1.25", 8, 125_000_000n],
    ["0.0005", 18, 500_000_000_000_000n],
  ])("parses %s with %i decimals", (value, decimals, expected) => {
    expect(parseSettlementAmount(value, decimals)).toBe(expected);
  });

  it("formats using configured decimals", () => {
    expect(formatSettlementAmount(1_250_000n, 6)).toBe("1.25");
  });

  it("never displays a positive base-unit amount as zero", () => {
    expect(formatSettlementAmount(1n, 18)).toBe("< 0.000001");
    expect(formatSettlementAmount(1n, 6)).toBe("0.000001");
  });
});
