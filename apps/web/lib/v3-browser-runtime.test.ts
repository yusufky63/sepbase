import { describe, expect, it } from "vitest";
import {
  isV3ManifestOperational,
  v3BrowserClientOptions,
  v3BrowserManifest,
} from "./v3-browser-runtime";

describe("V3 browser runtime", () => {
  it("keeps the complete candidate out of the public browser UI", () => {
    expect(isV3ManifestOperational()).toBe(false);
  });

  it("pins manifest and RPC origins without accepting request-controlled URLs", () => {
    expect(v3BrowserClientOptions("https://names.example/path")).toEqual({
      manifestUrl: "https://names.example/deployment-manifest.v3.json",
      rpcUrl: v3BrowserManifest.rpcUrl,
      allowedManifestOrigins: ["https://names.example"],
      allowedRpcOrigins: [new URL(v3BrowserManifest.rpcUrl).origin],
    });
  });

  it("requires live status, all runtime identities and locked wiring", () => {
    const live = structuredClone(v3BrowserManifest);
    live.releaseStatus = "live";
    expect(isV3ManifestOperational(live)).toBe(true);

    const incomplete = structuredClone(live);
    incomplete.contracts.controller.address = null;
    expect(isV3ManifestOperational(incomplete)).toBe(false);

    const draft = structuredClone(v3BrowserManifest);
    draft.releaseStatus = "draft";
    expect(isV3ManifestOperational(draft)).toBe(false);
  });
});
