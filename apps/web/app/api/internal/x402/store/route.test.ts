import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalToken = process.env.X402_IDEMPOTENCY_STORE_AUTH_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.X402_IDEMPOTENCY_STORE_AUTH_TOKEN;
  else process.env.X402_IDEMPOTENCY_STORE_AUTH_TOKEN = originalToken;
});

describe("POST /api/internal/x402/store", () => {
  it("fails closed before parsing the body when server authentication is missing", async () => {
    delete process.env.X402_IDEMPOTENCY_STORE_AUTH_TOKEN;
    const response = await POST(new Request("https://sepbase.example/api/internal/x402/store", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not-json",
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "CAS_AUTH_NOT_CONFIGURED", message: "The encrypted x402 store is unavailable." },
    });
  });

  it("uses constant-shape bearer rejection without opening the database", async () => {
    process.env.X402_IDEMPOTENCY_STORE_AUTH_TOKEN = "configured-token-with-safe-length";
    const response = await POST(new Request("https://sepbase.example/api/internal/x402/store", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json",
      },
      body: "{}",
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });
});
