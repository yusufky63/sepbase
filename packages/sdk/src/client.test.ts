import { describe, expect, it } from "vitest";
import manifestFixture from "../../../apps/web/public/deployment-manifest.json";
import { isValidLabel, normalizeLabel } from "./client";
import { parseManifest } from "./manifest";

describe("label utilities", () => {
  it("normalizes a configured suffix once", () => {
    expect(normalizeLabel("  Alice.SEPBASE  ", "sepbase")).toBe("alice");
    expect(normalizeLabel("alice.other", "sepbase")).toBe("alice.other");
  });

  it("validates the contract label grammar", () => {
    expect(isValidLabel("a")).toBe(true);
    expect(isValidLabel("ab")).toBe(true);
    expect(isValidLabel("alice-01")).toBe(true);
    expect(isValidLabel("al--ice")).toBe(false);
    expect(isValidLabel("Alice")).toBe(false);
  });
});

describe("manifest", () => {
  it("rejects unsupported schema versions", () => {
    expect(() => parseManifest({ schemaVersion: 2 })).toThrow();
  });

  it("accepts the generated v3 discovery contract", () => {
    expect(parseManifest(manifestFixture).contractVersion).toBe("2.0.0");
  });

  it("rejects contradictory premium and testnet metadata", () => {
    expect(() => parseManifest({
      ...manifestFixture,
      shortNamePriceMultipliers: [1, 2, 3],
    })).toThrow(/descend/i);
    expect(() => parseManifest({
      ...manifestFixture,
      referenceFiat: { currency: "USD", amount: "1", asOf: "2026-07-11", maxAgeDays: 30 },
    })).toThrow(/testnet/i);
  });
});
