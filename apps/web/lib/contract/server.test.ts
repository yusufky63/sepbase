import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { normalizeListing } from "./normalization";

describe("normalizeListing", () => {
  it("normalizes the flat tuple returned by the public listings getter", () => {
    const seller = "0x1111111111111111111111111111111111111111";
    expect(normalizeListing([7n, seller, 9n, 11n, 0])).toEqual({
      tokenId: 7n,
      seller,
      price: 9n,
      listedAt: 11n,
      feeBps: 0,
    });
  });

  it("treats the zero-address tuple as no listing", () => {
    expect(normalizeListing([0n, zeroAddress, 0n, 0n, 0])).toBeNull();
  });
});
