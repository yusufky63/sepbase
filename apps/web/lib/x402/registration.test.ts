import { describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { createHmacQuoteAuthenticator } from "./quote-auth";
import {
  assertRegistrationPlanRuntime,
  paymentAuthorizationHash,
  paymentPayloadHash,
  registrationRequestFingerprint,
  type RegistrationPlanRuntime,
} from "./registration";
import type { RegistrationExecutionPlan, X402RegistrationPaymentIntent } from "./types";

const keeper = getAddress("0x5555555555555555555555555555555555555555");
const token = getAddress("0x4444444444444444444444444444444444444444");
const commitTarget = getAddress("0x1111111111111111111111111111111111111111");
const revealTarget = getAddress("0x2222222222222222222222222222222222222222");
const typedDataDigest = `0x${"aa".repeat(32)}` as const;
const controllerAttestationHash = `0x${"ab".repeat(32)}` as const;
const authenticator = createHmacQuoteAuthenticator({
  keyId: "test-key",
  key: new Uint8Array(32).fill(9),
});

const plan: RegistrationExecutionPlan = {
  schema: "sepbase.x402.registration-plan.v1",
  planId: `sha256:${"33".repeat(32)}`,
  quoteId: `sha256:${"11".repeat(32)}`,
  chainId: 84_532,
  network: "eip155:84532",
  normalizationAttestation: {
    schema: "sepbase.normalization-attestation.v1",
    domain: { name: "ChainNameControllerV3", version: "3" },
    claims: {
      chainId: 84_532,
      controller: revealTarget,
      normalizationProfileHash: `0x${"44".repeat(32)}`,
      labelHash: `0x${"55".repeat(32)}`,
      recipient: keeper,
      validUntil: "1800000300",
    },
    typedDataDigest,
    controllerAttestationHash,
    signature: `0x${"66".repeat(65)}`,
  },
  steps: [
    { kind: "commit", target: commitTarget, selector: "0xaaaaaaaa", calldata: "0xaaaaaaaa", valueBaseUnits: "0" },
    { kind: "reveal", target: revealTarget, selector: "0xbbbbbbbb", calldata: "0xbbbbbbbb", valueBaseUnits: "0" },
  ],
  revealWindow: { clock: "block", minimumAge: "2", maximumAge: "120" },
};
const intent: X402RegistrationPaymentIntent = {
  quoteId: plan.quoteId,
  planId: plan.planId,
  chainId: plan.chainId,
  network: plan.network,
  resourcePath: "/api/x402/registration",
  description: "Register agent.sepbase",
  asset: token,
  amountBaseUnits: "1000000",
  payTo: keeper,
  issuedAt: "1800000000",
  expiresAt: "1800000300",
  paymentTimeoutSeconds: 300,
  normalizationTypedDataDigest: typedDataDigest,
  controllerAttestationHash,
  normalizationValidUntil: "1800000300",
};

describe("x402 plan execution guards", () => {
  it("deduplicates the underlying authorization across client-chosen payment identifiers", () => {
    const accepted = {
      scheme: "exact",
      network: "eip155:84532" as const,
      asset: token,
      amount: "1000000",
      payTo: keeper,
      maxTimeoutSeconds: 120,
      extra: {},
    };
    const first = {
      x402Version: 2 as const,
      accepted,
      payload: { authorization: { nonce: "0x01", signature: "test" } },
      extensions: { "payment-identifier": { info: { id: "pay_1234567890abcdef" } } },
    };
    const second = {
      ...first,
      extensions: { "payment-identifier": { info: { id: "pay_fedcba0987654321" } } },
    };
    expect(paymentAuthorizationHash(first)).toBe(paymentAuthorizationHash(second));
    expect(paymentPayloadHash(first)).not.toBe(paymentPayloadHash(second));
  });

  it("binds plan and normalization attestation fields into the durable request fingerprint", () => {
    const fingerprint = registrationRequestFingerprint({ intent, plan });
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(registrationRequestFingerprint({
      intent: { ...intent, normalizationValidUntil: "1800000299" },
      plan,
    })).not.toBe(fingerprint);
    expect(registrationRequestFingerprint({
      intent,
      plan: { ...plan, planId: `sha256:${"99".repeat(32)}` },
    })).not.toBe(fingerprint);
  });

  it("forbids non-distributed storage even with official protocol and a signer", () => {
    const runtime = {
      adapter: {
        protocolVersion: 2,
        implementation: "@x402/core",
        createChallenge: vi.fn(),
        decodePayment: vi.fn(),
        matchPayment: vi.fn(),
        verify: vi.fn(),
        settle: vi.fn(),
        encodeSettlement: vi.fn(),
      },
      store: {
        durable: true,
        distributed: false,
        atomicCompareAndSet: true,
        encryptedAtRest: true,
        globalAuthorizationUniqueness: true,
        deterministicChallengePersistence: false,
        kind: "in-memory",
      },
      signer: { configured: true, address: keeper, provider: "external" },
      reconciler: {},
      planAdapter: {
        contractGeneration: "v3",
        validateBundle: vi.fn(),
        decodeAndRecomputeCalldata: vi.fn(),
      },
      quoteAuthenticator: authenticator,
    } as unknown as RegistrationPlanRuntime;
    expect(() => assertRegistrationPlanRuntime(runtime))
      .toThrowError(expect.objectContaining({ code: "DURABLE_STORE_REQUIRED" }));
  });
});
