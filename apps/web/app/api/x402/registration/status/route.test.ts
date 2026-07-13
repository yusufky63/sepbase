import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/x402/registration/status", () => {
  it("fails closed before parsing identifiers while the V3 paid runtime is unavailable", async () => {
    const response = await GET(new Request(
      "https://names.example/api/x402/registration/status?paymentIdentifier=secret&planId=invalid",
    ));
    expect(response.status).toBe(503);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("X402_PAID_EXECUTION_AWAITING_V3");
    expect(serialized).not.toContain("secret");
  });
});
