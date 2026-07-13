import { describe, expect, it, vi } from "vitest";
import type { V3PaidRegistrationRuntime } from "./runtime-factory";
import { handleV3PaidRegistration } from "./paid-route";

const quoteId = `sha256:${"11".repeat(32)}` as const;
const planId = `sha256:${"22".repeat(32)}` as const;
const bundle = {
  signedQuote: { schema: "signed-test-quote" },
  quoteId,
  planId,
};
const preparedPlan = {
  quoteId,
  planId,
  signedQuote: bundle.signedQuote,
  executionPlan: { planId, quoteId },
  expiresAt: "1800000300",
};
const configured = {
  runtime: {
    store: {
      loadPreparedPlan: vi.fn(async () => preparedPlan),
    },
  },
  attestationIssuer: {},
  siteOrigin: "https://names.example",
  leaseSeconds: 300,
  readiness: { ready: true },
} as unknown as V3PaidRegistrationRuntime;
const record = {
  paymentIdentifier: "pay_1234567890abcdef",
  requestFingerprint: `sha256:${"33".repeat(32)}`,
  paymentPayloadHash: `sha256:${"44".repeat(32)}`,
  paymentAuthorizationHash: `sha256:${"55".repeat(32)}`,
  planId,
  quoteId,
  status: "verified" as const,
  version: 1,
  refundDisposition: "not-required-unsettled" as const,
  updatedAt: "2027-01-15T08:00:00.000Z",
};

function request(headers?: HeadersInit, body: unknown = bundle) {
  return new Request("https://names.example/api/x402/registration", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("activation-ready paid x402 route", () => {
  it("returns the persisted official payment challenge without starting a workflow", async () => {
    const startWorkflow = vi.fn();
    const response = await handleV3PaidRegistration(request(), {
      loadRuntime: () => configured,
      executeWorkflow: vi.fn(async () => ({
        kind: "payment-required" as const,
        paymentRequiredHeader: "official-payment-required-v2",
      })),
      startWorkflow,
      nowSeconds: () => 1_800_000_000,
    });
    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).toBe("official-payment-required-v2");
    expect(startWorkflow).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PAYMENT_REQUIRED" },
      order: { quoteId, planId, status: "quoted" },
    });
  });

  it("queues only the non-secret durable order keys after payment verification", async () => {
    const startWorkflow = vi.fn(async () => ({
      runId: "run_123",
      order: { paymentIdentifier: record.paymentIdentifier, planId, status: "reserved" as const },
    }));
    const response = await handleV3PaidRegistration(request({
      "PAYMENT-SIGNATURE": "must-never-be-reflected",
    }), {
      loadRuntime: () => configured,
      executeWorkflow: vi.fn(async () => ({ kind: "pending" as const, record })),
      startWorkflow,
      nowSeconds: () => 1_800_000_000,
    });
    expect(response.status).toBe(202);
    expect(startWorkflow).toHaveBeenCalledWith({
      paymentIdentifier: record.paymentIdentifier,
      planId,
    });
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("run_123");
    expect(serialized).not.toContain("must-never-be-reflected");
    expect(serialized).not.toContain(record.paymentPayloadHash);
    expect(serialized).not.toContain(record.paymentAuthorizationHash);
  });

  it("rejects oversized or non-JSON input before payment parsing", async () => {
    const executeWorkflow = vi.fn();
    const oversized = await handleV3PaidRegistration(request({
      "Content-Length": String(64 * 1024 + 1),
      "PAYMENT-SIGNATURE": "sensitive-payment-material",
    }), {
      loadRuntime: () => configured,
      executeWorkflow,
    });
    expect(oversized.status).toBe(413);
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(JSON.stringify(await oversized.json())).not.toContain("sensitive-payment-material");

    const wrongType = await handleV3PaidRegistration(new Request(
      "https://names.example/api/x402/registration",
      { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" },
    ), {
      loadRuntime: () => configured,
      executeWorkflow,
    });
    expect(wrongType.status).toBe(415);
  });
});
