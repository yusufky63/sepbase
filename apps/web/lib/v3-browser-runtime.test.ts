import { describe, expect, it } from "vitest";
import {
  isV3ManifestOperational,
  v3BrowserClientOptions,
  v3BrowserManifest,
} from "./v3-browser-runtime";

describe("V3 browser runtime", () => {
  it("marks the complete candidate operational", () => {
    expect(isV3ManifestOperational()).toBe(true);
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
    const incomplete = structuredClone(v3BrowserManifest);
    incomplete.contracts.controller.address = null;
    expect(isV3ManifestOperational(incomplete)).toBe(false);

    const draft = structuredClone(v3BrowserManifest);
    draft.releaseStatus = "draft";
    expect(isV3ManifestOperational(draft)).toBe(false);
  });
});
