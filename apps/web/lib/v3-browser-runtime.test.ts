import { describe, expect, it } from "vitest";
import { NotDeployedError } from "@sepbase/sdk";
import {
  getV3BrowserClient,
  isV3ManifestOperational,
  v3BrowserClientOptions,
  v3BrowserManifest,
} from "./v3-browser-runtime";

describe("V3 browser runtime", () => {
  it("keeps the address-free draft unavailable before any runtime fetch", async () => {
    expect(isV3ManifestOperational()).toBe(false);
    await expect(getV3BrowserClient()).rejects.toBeInstanceOf(NotDeployedError);
  });

  it("pins manifest and RPC origins without accepting request-controlled URLs", () => {
    expect(v3BrowserClientOptions("https://names.example/path")).toEqual({
      manifestUrl: "https://names.example/deployment-manifest.v3.json",
      rpcUrl: v3BrowserManifest.rpcUrl,
      allowedManifestOrigins: ["https://names.example"],
      allowedRpcOrigins: [new URL(v3BrowserManifest.rpcUrl).origin],
    });
  });

  it("requires candidate/live status, all runtime identities and locked wiring", () => {
    const candidate = structuredClone(v3BrowserManifest);
    candidate.releaseStatus = "candidate";
    candidate.wiring.suiteConfigured = true;
    expect(isV3ManifestOperational(candidate)).toBe(false);
  });
});
