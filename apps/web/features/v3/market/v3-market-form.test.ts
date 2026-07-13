import { describe, expect, it } from "vitest";
import {
  buildV3MarketIntent,
  createV3MarketFormState,
  type V3MarketFormState,
} from "./v3-market-form";

const recipient = "0x1111111111111111111111111111111111111111";

function form(overrides: Partial<V3MarketFormState>): V3MarketFormState {
  return {
    ...createV3MarketFormState(recipient),
    tokenId: "42",
    offerId: `0x${"ab".repeat(32)}`,
    price: "1.25",
    amount: "2.5",
    deadline: "2030-01-01T00:00",
    startAt: "2030-01-01T00:00",
    endAt: "2030-01-02T00:00",
    ...overrides,
  };
}

describe("V3 market form", () => {
  it("uses manifest decimals for settlement amounts", () => {
    expect(buildV3MarketIntent(form({ action: "fixed-list" }), 6)).toEqual({
      kind: "fixed-list",
      tokenId: 42n,
      price: 1_250_000n,
      deadline: BigInt(Date.parse("2030-01-01T00:00") / 1_000),
    });
    expect(buildV3MarketIntent(form({ action: "auction-bid" }), 6)).toMatchObject({
      kind: "auction-bid",
      amount: 2_500_000n,
      recipient,
    });
  });

  it("keeps per-token approval and unified claims semantically distinct", () => {
    expect(buildV3MarketIntent(form({ action: "marketplace-approve" }), 6)).toEqual({
      kind: "marketplace-approve",
      tokenId: 42n,
    });
    expect(buildV3MarketIntent(form({ action: "claim", claimKind: "offer-refund" }), 6)).toEqual({
      kind: "claim",
      claimKind: "offer-refund",
      recipient,
    });
  });

  it("fails closed for malformed token, offer, address and amount inputs", () => {
    expect(() => buildV3MarketIntent(form({ action: "fixed-buy", tokenId: "0x2a" }), 6)).toThrow("decimal token ID");
    expect(() => buildV3MarketIntent(form({ action: "offer-accept", offerId: "0x12" }), 6)).toThrow("32-byte offer ID");
    expect(() => buildV3MarketIntent(form({ action: "fixed-buy", recipient: "invalid" }), 6)).toThrow("valid recipient");
    expect(() => buildV3MarketIntent(form({ action: "offer-create", amount: "0" }), 6)).toThrow("positive 6-decimal");
  });
});
