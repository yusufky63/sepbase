import { describe, expect, it } from "vitest";
import { assessAddressIdentity, assessNameResolution } from "./identity";

const account = "0x78de409a6306550882328E2a67160471368387FF" as const;
const other = "0xEAa823AB4C4eE00283d8ed7be713ddf8A5ba0Fac" as const;

describe("identity verification", () => {
  it("accepts an active forward-confirmed primary identity", () => {
    const identity = assessAddressIdentity({
      account,
      primaryName: "alice.sepbase",
      label: "alice",
      tokenId: 1n,
      status: 1,
      owner: account,
      resolvedAddress: account,
      fullName: "alice.sepbase",
      expiresAt: 2_000_000_000n,
      blockNumber: 10n,
    });

    expect(identity).toMatchObject({ verified: true, reason: "verified", lifecycle: "active" });
  });

  it("fails closed when a primary name no longer resolves to the account", () => {
    const identity = assessAddressIdentity({
      account,
      primaryName: "alice.sepbase",
      label: "alice",
      tokenId: 1n,
      status: 1,
      owner: account,
      resolvedAddress: other,
      fullName: "alice.sepbase",
      expiresAt: 2_000_000_000n,
      blockNumber: 10n,
    });

    expect(identity).toMatchObject({ verified: false, reason: "resolution-mismatch" });
  });

  it("checks an expected recipient when verifying a name", () => {
    const resolution = assessNameResolution({
      label: "alice",
      fullName: "alice.sepbase",
      tokenId: 1n,
      status: 2,
      owner: account,
      resolvedAddress: account,
      primaryName: "alice.sepbase",
      expectedAddress: other,
      expiresAt: 2_000_000_000n,
      blockNumber: 10n,
    });

    expect(resolution).toMatchObject({
      verified: false,
      reason: "expected-address-mismatch",
      lifecycle: "grace",
    });
  });
});
