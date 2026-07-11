import { describe, expect, it } from "vitest";
import { formatFiatReferenceAmount, isFiatReferenceCurrent } from "./fiat-reference";

describe("fiat reference freshness", () => {
  const reference = { currency: "USD", amount: "1.00", asOf: "2026-07-01", maxAgeDays: 7 };

  it("shows only a non-expired dated reference", () => {
    expect(isFiatReferenceCurrent(reference, new Date("2026-07-08T00:00:00Z"))).toBe(true);
    expect(isFiatReferenceCurrent(reference, new Date("2026-07-09T00:00:00Z"))).toBe(false);
    expect(isFiatReferenceCurrent(reference, new Date("2026-06-30T23:59:59Z"))).toBe(false);
  });

  it("derives tier and marketplace references without floating point math", () => {
    const now = new Date("2026-07-08T00:00:00Z");
    expect(formatFiatReferenceAmount(500n, 500n, reference, now)).toBe("USD 1.00");
    expect(formatFiatReferenceAmount(12_500n, 500n, reference, now)).toBe("USD 25.00");
    expect(formatFiatReferenceAmount(1n, 500n, reference, now)).toBe("< USD 0.01");
    expect(formatFiatReferenceAmount(500n, 500n, reference, new Date("2026-07-09T00:00:00Z"))).toBeNull();
    expect(formatFiatReferenceAmount(500n, 500n, null, now)).toBeNull();
  });
});
