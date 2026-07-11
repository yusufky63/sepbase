import { describe, expect, it, vi } from "vitest";
import manifest from "../../../apps/web/public/deployment-manifest.json";
import { getMarket } from "./marketplace";

const context = {
  contractVersion: manifest.contractVersion,
  chainId: manifest.chainId,
  chainName: manifest.chainName,
  contract: manifest.contract,
  suffix: manifest.suffix,
  nameRules: manifest.nameRules,
  settlement: manifest.settlement,
  pricing: {
    standardAnnualPriceBaseUnits: manifest.annualPriceBaseUnits,
    shortNamePriceMultipliers: manifest.shortNamePriceMultipliers,
    referenceFiat: manifest.referenceFiat,
  },
};

describe("getMarket", () => {
  it("uses the manifest path and validates the response envelope", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      items: [],
      marketplacePaused: false,
      solvent: true,
      blockNumber: "123",
      nextCursor: null,
      hasMore: false,
      scanned: 0,
      context,
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

    await expect(getMarket(
      "https://names.example/manifest.json",
      { cursor: "7", limit: 12, path: "/custom/market" },
      fetcher,
    )).resolves.toMatchObject({ blockNumber: "123", items: [] });

    const requestUrl = String((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(requestUrl).toBe("https://names.example/custom/market?cursor=7&limit=12");
  });

  it("rejects malformed success responses", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ items: "not-an-array" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    await expect(getMarket("https://names.example", {}, fetcher)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
