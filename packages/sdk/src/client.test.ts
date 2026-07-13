import { describe, expect, it, vi } from "vitest";
import manifestFixture from "../../../apps/web/public/deployment-manifest.json";
import { createSepbaseClient, isValidLabel, normalizeLabel } from "./client";
import { createContractContext } from "./contract";
import { loadManifest, parseManifest, resolveManifestUrl } from "./manifest";

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

  it.each([
    "//internal.example/abi.json",
    "/\\internal.example/abi.json",
    "/%2e%2e/abi.json",
    "/%252e%252e/abi.json",
    "/api/%3fsecret",
  ])("rejects unsafe origin-relative resource paths: %s", (abiUrl) => {
    expect(() => parseManifest({ ...manifestFixture, abiUrl })).toThrow(/safe origin-relative/i);
    expect(() => resolveManifestUrl(abiUrl, new URL("https://names.example/manifest.json")))
      .toThrow(/safe origin-relative/i);
  });

  it("keeps resolved manifest resources on the manifest origin", () => {
    expect(resolveManifestUrl(
      "/abi/ChainNameService.json",
      new URL("https://names.example/discovery/manifest.json"),
    ).href).toBe("https://names.example/abi/ChainNameService.json");
  });

  it("requests manifests without following redirects", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return Response.redirect("https://internal.example/manifest.json", 302);
    }) as typeof fetch;

    await expect(loadManifest("https://names.example/manifest.json", fetcher))
      .rejects.toMatchObject({ code: "MANIFEST_MISMATCH" });
  });

  it("rejects a followed manifest response that escaped the allowed origin", async () => {
    const response = new Response(JSON.stringify(manifestFixture), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    Object.defineProperty(response, "url", {
      configurable: true,
      value: "https://internal.example/manifest.json",
    });
    const fetcher = vi.fn(async () => response) as unknown as typeof fetch;

    await expect(loadManifest("https://names.example/manifest.json", fetcher))
      .rejects.toMatchObject({ code: "MANIFEST_MISMATCH" });
  });

  it("rejects ABI redirects before creating an RPC client", async () => {
    let callCount = 0;
    const fetcher = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify(manifestFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Response.redirect("https://internal.example/abi.json", 302);
    }) as unknown as typeof fetch;

    await expect(createContractContext(
      "https://names.example/manifest.json",
      fetcher,
    )).rejects.toMatchObject({ code: "MANIFEST_MISMATCH" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects embedded credentials before fetching discovery", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(createSepbaseClient({
      manifestUrl: "https://user:password@names.example/manifest.json",
      fetcher,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
