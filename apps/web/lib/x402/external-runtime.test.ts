import { describe, expect, it, vi } from "vitest";
import { getAddress, hashTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildRegistrationExecutionPlan,
  normalizationControllerAttestationHash,
  registrationExecutionPlanId,
} from "./execution-plan";
import {
  ExternalDurableIdempotencyStore,
  ExternalManagedPlanSigner,
  ExternalNormalizationAttestationIssuer,
} from "./external-runtime";
import type { PersistedX402Challenge, RegistrationReservation } from "./registration";

const commitTarget = getAddress("0x1111111111111111111111111111111111111111");
const controller = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const keeper = getAddress("0x4444444444444444444444444444444444444444");
const normalizationProfileHash = `0x${"55".repeat(32)}` as const;
const labelHash = `0x${"66".repeat(32)}` as const;
const quoteId = `sha256:${"11".repeat(32)}` as const;
const requestFingerprint = `sha256:${"22".repeat(32)}`;
const paymentPayloadHash = `sha256:${"33".repeat(32)}`;
const paymentAuthorizationHash = `sha256:${"44".repeat(32)}`;
const transactionHash = `0x${"77".repeat(32)}`;
const types = {
  NormalizationAttestation: [
    { name: "chainId", type: "uint256" },
    { name: "controller", type: "address" },
    { name: "normalizationProfileHash", type: "bytes32" },
    { name: "labelHash", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "validUntil", type: "uint64" },
  ],
} as const;

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function fixture() {
  const account = privateKeyToAccount(generatePrivateKey());
  const domain = {
    name: "ChainNameControllerV3",
    version: "3",
    chainId: 84_532,
    verifyingContract: controller,
  } as const;
  const message = {
    chainId: 84_532n,
    controller,
    normalizationProfileHash,
    labelHash,
    recipient: keeper,
    validUntil: 1_800_000_300n,
  } as const;
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "NormalizationAttestation",
    message,
  });
  const typedDataDigest = hashTypedData({
    domain,
    types,
    primaryType: "NormalizationAttestation",
    message,
  });
  const controllerAttestationHash = normalizationControllerAttestationHash("1800000300", signature);
  const policy = {
    chainId: 84_532,
    allowNativeValue: false,
    allowlist: {
      commit: { target: commitTarget, selector: "0xaaaaaaaa" as const },
      reveal: { target: controller, selector: "0xbbbbbbbb" as const },
    },
    normalization: { attestor: account.address, controller, normalizationProfileHash },
  };
  const attestation = {
    schema: "sepbase.normalization-attestation.v1" as const,
    domain: { name: domain.name, version: domain.version },
    claims: {
      chainId: 84_532,
      controller,
      normalizationProfileHash,
      labelHash,
      recipient: keeper,
      validUntil: "1800000300",
    },
    typedDataDigest,
    controllerAttestationHash,
    signature,
  };
  const plan = await buildRegistrationExecutionPlan({
    value: {
      schema: "sepbase.x402.registration-plan.v1",
      quoteId,
      chainId: 84_532,
      network: "eip155:84532",
      normalizationAttestation: attestation,
      steps: [
        {
          kind: "commit",
          target: commitTarget,
          selector: "0xaaaaaaaa",
          calldata: `0xaaaaaaaa${controllerAttestationHash.slice(2)}`,
          valueBaseUnits: "0",
        },
        {
          kind: "reveal",
          target: controller,
          selector: "0xbbbbbbbb",
          calldata: `0xbbbbbbbb${controllerAttestationHash.slice(2)}${"00".repeat(32)}`,
          valueBaseUnits: "0",
        },
      ],
      revealWindow: { clock: "block", minimumAge: "2", maximumAge: "120" },
    },
    policy,
    nowSeconds: 1_800_000_000,
  });
  return { attestation, plan, policy };
}

function reservationFor(plan: Awaited<ReturnType<typeof fixture>>["plan"]): RegistrationReservation {
  return {
    paymentIdentifier: "pay_1234567890abcdef",
    requestFingerprint,
    paymentPayloadHash,
    paymentAuthorizationHash,
    planId: plan.planId,
    paymentPayload: {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "eip155:84532",
        asset: token,
        amount: "1000000",
        payTo: keeper,
        maxTimeoutSeconds: 120,
        extra: {},
      },
      payload: { authorization: "test-only" },
    },
    signedQuote: { schema: "test-signed-quote" },
    executionPlan: plan,
    quoteId,
    leaseSeconds: 300,
  };
}

describe("external V3 paid-runtime adapters", () => {
  it("matches the controller uint64/signature hash vector", () => {
    const signature = "0x3d008b668f0bc8d95a592a1ec3f919b55800e515a181de47966828abc178e6497babe2cbabf27761f946cec48303ed7ceb89bf0ee4a186ebfbb0db0cdc9ade171c" as const;
    expect(normalizationControllerAttestationHash("1800007200", signature))
      .toBe("0xdd0e8abe69a0abd42f71f62a088325874e059357e934f2a2b5e4a09f1c809e69");
  });

  it("persists payment and plan behind an authenticated encrypted CAS capability contract", async () => {
    const { plan } = await fixture();
    const reservation = reservationFor(plan);
    const authToken = "durable-store-secret-token";
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return jsonResponse({
        schema: "sepbase.x402.idempotency.v1",
        outcome: "acquired",
        capabilities: {
          durable: true,
          distributed: true,
          atomicCompareAndSet: true,
          encryptedAtRest: true,
          globalAuthorizationUniqueness: true,
          deterministicChallengePersistence: true,
          fencingLeases: true,
        },
        record: {
          paymentIdentifier: reservation.paymentIdentifier,
          requestFingerprint,
          paymentPayloadHash,
          paymentAuthorizationHash,
          planId: plan.planId,
          quoteId,
          status: "reserved",
          version: 0,
          refundDisposition: "not-required-unsettled",
          updatedAt: "2027-01-15T08:00:00.000Z",
        },
        lease: {
          token: "lease_1234567890abcdef",
          fencingToken: "1",
          expiresAt: "2027-01-15T08:05:00.000Z",
        },
      });
    });
    const store = new ExternalDurableIdempotencyStore({
      url: "https://store.example/v1/registrations",
      authToken,
      timeoutMs: 5_000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(store.reserveOrAcquire(reservation)).resolves.toMatchObject({ outcome: "acquired" });
    const init = calls[0] ?? {};
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${authToken}`);
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toContain('"operation":"reserve-or-acquire-plan"');
    expect(init.body).toContain(plan.normalizationAttestation.controllerAttestationHash);
    expect(init.body).not.toContain(authToken);
  });

  it("loads the encrypted payment and execution plan through an exact identifier binding", async () => {
    const { plan } = await fixture();
    const reservation = reservationFor(plan);
    let requestInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return jsonResponse({
      schema: "sepbase.x402.idempotency.v1",
      outcome: "found",
      capabilities: {
        durable: true,
        distributed: true,
        atomicCompareAndSet: true,
        encryptedAtRest: true,
        globalAuthorizationUniqueness: true,
        deterministicChallengePersistence: true,
        fencingLeases: true,
      },
      reservation,
      });
    });
    const store = new ExternalDurableIdempotencyStore({
      url: "https://store.example/v1/registrations",
      authToken: "durable-store-secret-token",
      timeoutMs: 5_000,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(store.loadReservation({
      paymentIdentifier: reservation.paymentIdentifier,
      planId: reservation.planId as `sha256:${string}`,
    })).resolves.toEqual(reservation);
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      schema: "sepbase.x402.idempotency.v1",
      operation: "load-registration-plan",
      paymentIdentifier: reservation.paymentIdentifier,
      planId: reservation.planId,
    });
  });

  it("persists and reloads a pre-payment plan without exposing its reveal calldata", async () => {
    const { plan } = await fixture();
    const prepared = {
      quoteId,
      planId: plan.planId,
      signedQuote: { schema: "signed-v3-quote" },
      executionPlan: plan,
      expiresAt: "1800000300",
    };
    const operations: string[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { operation: string };
      operations.push(request.operation);
      return request.operation === "persist-prepared-registration-plan"
        ? jsonResponse({
          schema: "sepbase.x402.idempotency.v1",
          outcome: "stored",
          prepared,
        })
        : jsonResponse({
          schema: "sepbase.x402.idempotency.v1",
          outcome: "found",
          capabilities: {
            durable: true,
            distributed: true,
            atomicCompareAndSet: true,
            encryptedAtRest: true,
            globalAuthorizationUniqueness: true,
            deterministicChallengePersistence: true,
            fencingLeases: true,
          },
          prepared,
        });
    });
    const store = new ExternalDurableIdempotencyStore({
      url: "https://store.example/v1/registrations",
      authToken: "durable-store-secret-token",
      timeoutMs: 5_000,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(store.persistPreparedPlan(prepared)).resolves.toMatchObject({ outcome: "stored" });
    await expect(store.loadPreparedPlan({ quoteId, planId: plan.planId })).resolves.toEqual(prepared);
    expect(operations).toEqual([
      "persist-prepared-registration-plan",
      "load-prepared-registration-plan",
    ]);
  });

  it("uses atomic external operations for deterministic challenge load/persist", async () => {
    const persisted: PersistedX402Challenge = {
      quoteId,
      planId: `sha256:${"99".repeat(32)}`,
      challengeHash: `sha256:${"88".repeat(32)}`,
      challenge: {
        paymentRequired: {
          x402Version: 2,
          resource: { url: "https://names.example/api/x402/registration" },
          accepts: [],
        },
        requirement: {
          scheme: "exact",
          network: "eip155:84532",
          asset: token,
          amount: "1000000",
          payTo: keeper,
          maxTimeoutSeconds: 120,
          extra: {},
        },
        paymentRequiredHeader: "stable-header",
        declaredExtensions: {},
      },
    };
    const operations: string[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { operation: string };
      operations.push(body.operation);
      if (body.operation === "load-registration-challenge") {
        return jsonResponse({
          schema: "sepbase.x402.idempotency.v1",
          outcome: "missing",
        });
      }
      return jsonResponse({
        schema: "sepbase.x402.idempotency.v1",
        outcome: "stored",
        persisted,
      });
    });
    const store = new ExternalDurableIdempotencyStore({
      url: "https://store.example/v1/registrations",
      authToken: "durable-store-secret-token",
      timeoutMs: 5_000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(store.loadChallenge({ quoteId, planId: persisted.planId })).resolves.toBeNull();
    await expect(store.persistChallenge(persisted)).resolves.toMatchObject({ outcome: "stored", persisted });
    expect(operations).toEqual(["load-registration-challenge", "persist-registration-challenge"]);
  });

  it("decodes and recomputes exact commit/reveal calldata before managed signing", async () => {
    const { plan, policy } = await fixture();
    const fetchImpl = vi.fn(async () => jsonResponse({
      schema: "sepbase.x402.managed-plan-signer.v1",
      signer: keeper,
      chainId: 84_532,
      planId: plan.planId,
      step: "commit",
      requestFingerprint,
      transactionHash,
      spendingPolicy: {
        settlementAsset: token,
        controller,
        maxOrderBaseUnits: "1000000",
        dailyLimitBaseUnits: "10000000",
      },
    }));
    const signer = new ExternalManagedPlanSigner({
      url: "https://signer.example/v1/transactions",
      authToken: "managed-signer-secret-token",
      timeoutMs: 5_000,
      address: keeper,
      provider: "external",
      limits: {
        settlementAsset: token,
        controller,
        maxOrderBaseUnits: 1_000_000n,
        dailyLimitBaseUnits: 10_000_000n,
      },
      policy,
      decodeAndRecomputeCalldata: (candidate) => {
        expect(candidate.chainId).toBe(plan.chainId);
        return {
          commit: plan.steps[0].calldata,
          reveal: plan.steps[1].calldata,
          controllerAttestationHash: plan.normalizationAttestation.controllerAttestationHash,
        };
      },
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(signer.broadcastStep({
      plan,
      step: "commit",
      paymentIdentifier: "pay_1234567890abcdef",
      requestFingerprint,
      fencingToken: "7",
    })).resolves.toBe(transactionHash);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const { planId: _planId, ...withoutId } = plan;
    void _planId;
    const mutatedWithoutId = {
      ...withoutId,
      steps: [
        { ...plan.steps[0], calldata: `0xaaaaaaaa${"00".repeat(32)}` as const },
        plan.steps[1],
      ] as const,
    };
    await expect(signer.broadcastStep({
      plan: { ...mutatedWithoutId, planId: registrationExecutionPlanId(mutatedWithoutId) },
      step: "commit",
      paymentIdentifier: "pay_1234567890abcdef",
      requestFingerprint,
      fencingToken: "8",
    })).rejects.toMatchObject({ code: "EXECUTION_PLAN_CALLDATA_MISMATCH" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("accepts only server-authored exact-domain normalization claims", async () => {
    const { attestation, policy } = await fixture();
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return jsonResponse({
        schema: "sepbase.normalization-attestation-issuer.v1",
        attestation,
      });
    });
    const issuer = new ExternalNormalizationAttestationIssuer({
      url: "https://attestor.example/v1/normalize",
      authToken: "attestation-issuer-secret-token",
      timeoutMs: 5_000,
      profileReference: "base-v3-2026-07",
      policy,
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(issuer.issue({
      rawLabel: "Agent",
      recipient: keeper,
      nowSeconds: 1_800_000_000,
    })).resolves.toMatchObject({
      typedDataDigest: attestation.typedDataDigest,
      controllerAttestationHash: attestation.controllerAttestationHash,
    });
    const body = String((calls[0] ?? {}).body);
    expect(body).toContain('"rawLabel":"Agent"');
    expect(body).not.toContain("labelHash");
    expect(body).not.toContain("normalizationProfileHash");
    expect(body).not.toContain("validUntil");
  });
});
