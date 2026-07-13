import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalEnabled = process.env.X402_REGISTRATION_ENABLED;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.X402_REGISTRATION_ENABLED;
  else process.env.X402_REGISTRATION_ENABLED = originalEnabled;
});

describe("POST /api/x402/registration", () => {
  it("awaits V3 without parsing payment data or runtime secrets", async () => {
    delete process.env.X402_REGISTRATION_ENABLED;
    const response = await POST(new Request("https://names.example/api/x402/registration", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": "must-not-be-reflected" },
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("access-control-allow-headers")).toContain("PAYMENT-SIGNATURE");
    expect(response.headers.get("access-control-expose-headers")).toContain("PAYMENT-REQUIRED");
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("X402_PAID_EXECUTION_AWAITING_V3");
    expect(JSON.stringify(body)).not.toContain("must-not-be-reflected");
    expect(JSON.stringify(body)).not.toMatch(/capabilities|blockers|configured|secret/i);
  });

  it("cannot activate paid execution with environment flags", async () => {
    process.env.X402_REGISTRATION_ENABLED = "true";
    const response = await POST(new Request("https://names.example/api/x402/registration", {
      method: "POST",
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "X402_PAID_EXECUTION_AWAITING_V3",
        readiness: {
          available: false,
          implementationStatus: "activation-gated",
          paidExecutionImplemented: true,
        },
      },
    });
  });
});
