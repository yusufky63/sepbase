import { describe, expect, it } from "vitest";
import {
  assertV3MarketPageBlock,
  v3MarketPageHistory,
  v3MarketPageTarget,
} from "./v3-market-pagination";

describe("V3 market pagination", () => {
  it("advances and returns through explicit cursor history", () => {
    expect(v3MarketPageTarget({ direction: "next", cursor: 0n, nextCursor: 50n, history: [] })).toBe(50n);
    const history = v3MarketPageHistory({ direction: "next", cursor: 0n, history: [] });
    expect(history).toEqual([0n]);
    expect(v3MarketPageTarget({ direction: "previous", cursor: 50n, nextCursor: 100n, history })).toBe(0n);
    expect(v3MarketPageHistory({ direction: "previous", cursor: 50n, history })).toEqual([]);
  });

  it("stops when the lens cursor cannot progress", () => {
    expect(v3MarketPageTarget({ direction: "next", cursor: 50n, nextCursor: 50n, history: [] })).toBeNull();
    expect(v3MarketPageTarget({ direction: "previous", cursor: 0n, nextCursor: 50n, history: [] })).toBeNull();
  });

  it("rejects any page that drifts from the original pinned block", () => {
    expect(() => assertV3MarketPageBlock(900n, 900n)).not.toThrow();
    expect(() => assertV3MarketPageBlock(901n, 900n)).toThrow("V3_MARKET_BLOCK_MISMATCH");
  });
});
