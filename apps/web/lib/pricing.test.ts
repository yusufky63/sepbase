import { describe, expect, it } from "vitest";
import { annualPriceForLength, packShortNamePriceMultipliers, priceMultiplierForLength } from "./pricing";

describe("short-name pricing", () => {
  const multipliers = [100, 25, 5] as const;

  it("selects a configured premium only for one to three characters", () => {
    expect(priceMultiplierForLength(1, multipliers)).toBe(100);
    expect(priceMultiplierForLength(2, multipliers)).toBe(25);
    expect(priceMultiplierForLength(3, multipliers)).toBe(5);
    expect(priceMultiplierForLength(4, multipliers)).toBe(1);
    expect(annualPriceForLength(500n, 2, multipliers)).toBe(12_500n);
  });

  it("packs the immutable constructor value one byte per tier", () => {
    expect(packShortNamePriceMultipliers(multipliers)).toBe(100 | (25 << 8) | (5 << 16));
  });
});
