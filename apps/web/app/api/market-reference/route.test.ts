import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("market reference API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a cached, validated Coinbase spot reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { amount: "2500.50", base: "ETH", currency: "USD" },
    }), { status: 200 })));

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    await expect(response.json()).resolves.toMatchObject({
      data: { asset: "ETH", currency: "USD", price: "2500.50", provider: "Coinbase" },
    });
  });

  it("fails closed when the provider payload is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { amount: "invalid", currency: "USD" },
    }), { status: 200 })));

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MARKET_REFERENCE_UNAVAILABLE" },
    });
  });
});
