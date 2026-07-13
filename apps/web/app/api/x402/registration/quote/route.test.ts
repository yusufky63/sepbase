import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("GET /api/x402/registration/quote", () => {
  it("rejects non-canonical labels before any RPC read", async () => {
    const response = await GET(new Request(
      "https://names.example/api/x402/registration/quote?label=Agent.sepbase&durationYears=1&recipient=0x2222222222222222222222222222222222222222",
    ));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NON_CANONICAL_LABEL", normalizedSuggestion: "agent" },
    });
  });

  it("requires recipient and rejects ambiguous query parameters", async () => {
    const missing = await GET(new Request(
      "https://names.example/api/x402/registration/quote?label=agent&durationYears=1",
    ));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "MISSING_INPUT" } });

    const duplicate = await GET(new Request(
      "https://names.example/api/x402/registration/quote?label=agent&label=other&durationYears=1&recipient=0x2222222222222222222222222222222222222222",
    ));
    expect(duplicate.status).toBe(400);
    await expect(duplicate.json()).resolves.toMatchObject({ error: { code: "AMBIGUOUS_INPUT" } });
  });
});

describe("POST /api/x402/registration/quote", () => {
  it("fails closed before parsing quote material while the V3 manifest is a draft", async () => {
    const response = await POST(new Request(
      "https://names.example/api/x402/registration/quote",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain", "PAYMENT-SIGNATURE": "must-not-be-reflected" },
        body: "not-json",
      },
    ));
    expect(response.status).toBe(503);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("X402_PAID_EXECUTION_AWAITING_V3");
    expect(serialized).not.toContain("must-not-be-reflected");
    expect(serialized).not.toContain("not-json");
  });
});
