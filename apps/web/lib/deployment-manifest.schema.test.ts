import { describe, expect, it } from "vitest";
import manifest from "../public/deployment-manifest.json";
import { deploymentManifestSchema } from "./deployment-manifest.schema";

describe("deploymentManifestSchema", () => {
  it("accepts the generated v3 manifest", () => {
    expect(deploymentManifestSchema.parse(manifest).contractVersion).toBe("2.0.0");
  });

  it("rejects an ascending short-name schedule", () => {
    expect(() => deploymentManifestSchema.parse({
      ...manifest,
      shortNamePriceMultipliers: [5, 25, 100],
    })).toThrow(/descend/i);
  });

  it("rejects fiat metadata on a testnet", () => {
    expect(() => deploymentManifestSchema.parse({
      ...manifest,
      referenceFiat: { currency: "USD", amount: "1", asOf: "2026-07-11", maxAgeDays: 30 },
    })).toThrow(/testnet/i);
  });

  it("rejects partial deployment identity", () => {
    expect(() => deploymentManifestSchema.parse({
      ...manifest,
      contract: null,
      deploymentBlock: null,
      deployedAt: null,
      owner: "0x0000000000000000000000000000000000000001",
      treasury: null,
    })).toThrow(/pre-deployment/i);
  });

  it("rejects manifest resource paths that can escape the current origin", () => {
    expect(() => deploymentManifestSchema.parse({
      ...manifest,
      abiUrl: "//internal.example/abi.json",
    })).toThrow(/same-origin/i);
    expect(() => deploymentManifestSchema.parse({
      ...manifest,
      docsUrl: "/%2e%2e/private",
    })).toThrow(/traversal/i);
  });
});
