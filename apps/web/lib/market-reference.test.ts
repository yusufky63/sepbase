import { describe, expect, it } from "vitest";
import { formatMarketReferenceAmount, marketReferenceEnvelopeSchema } from "./market-reference";

describe("market reference formatting", () => {
  it("converts base units with integer arithmetic", () => {
    expect(formatMarketReferenceAmount(500_000_000_000_000n, 18, "2500.50", "USD")).toBe("USD 1.25");
    expect(formatMarketReferenceAmount(1n, 18, "2500.50", "USD")).toBe("< USD 0.01");
    expect(formatMarketReferenceAmount(1_000_000n, 6, "1", "USD")).toBe("USD 1.00");
  });

  it("rejects malformed or non-positive quote data", () => {
    expect(formatMarketReferenceAmount(1n, 18, "0", "USD")).toBeNull();
    expect(formatMarketReferenceAmount(1n, 18, "not-a-price", "USD")).toBeNull();
    expect(formatMarketReferenceAmount(-1n, 18, "2500", "USD")).toBeNull();
  });

  it("validates the public quote envelope", () => {
    expect(marketReferenceEnvelopeSchema.parse({
      data: {
        asset: "ETH",
        currency: "USD",
        price: "2500.50",
        provider: "Coinbase",
        asOf: "2026-07-12T00:00:00.000Z",
      },
    }).data.price).toBe("2500.50");
  });
});
