import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { decodeOwnedNames, multicallReadError } from "./hooks";

const success = (result: unknown) => ({ status: "success", result }) as const;
const failure = { status: "failure", error: new Error("RPC failure") } as const;

describe("multicallReadError", () => {
  it("reports a failed required result instead of accepting partial data", () => {
    const error = multicallReadError(
      "Protocol health",
      [success(true), failure, success(false)],
      [0, 1, 2],
      true,
    );

    expect(error?.message).toContain("indexes 1");
  });

  it("does not treat an optional failed result as a read failure", () => {
    expect(multicallReadError("Name", [success(0), failure], [0], true)).toBeNull();
  });

  it("waits for the query before evaluating absent results", () => {
    expect(multicallReadError("Name", undefined, [0], false)).toBeNull();
  });
});

describe("decodeOwnedNames", () => {
  const emptyListing = [0n, zeroAddress, 0n, 0n, 0] as const;

  it("returns a page only when every owned-name field is present and type-valid", () => {
    expect(decodeOwnedNames([7n], [
      success("alice.sepbase"),
      success(1),
      success(2_000_000_000n),
      success(emptyListing),
    ])).toEqual([{
      tokenId: 7n,
      fullName: "alice.sepbase",
      status: 1,
      expiresAt: 2_000_000_000n,
      listing: null,
    }]);
  });

  it("rejects the transient post-registration state before detail results arrive", () => {
    expect(decodeOwnedNames([7n], undefined)).toBeNull();
    expect(decodeOwnedNames([7n], [])).toBeNull();
  });

  it("rejects success envelopes whose decoded values are missing", () => {
    expect(decodeOwnedNames([7n], [
      success(undefined),
      success(1),
      success(undefined),
      success(emptyListing),
    ])).toBeNull();
  });
});
