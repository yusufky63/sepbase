import { encodePaymentRequiredHeader } from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";
import { getAddress, hashTypedData, type Hash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  assertRegistrationExecutionPlanPolicy,
  buildRegistrationExecutionPlan,
  normalizationControllerAttestationHash,
} from "./execution-plan";
import type {
  OfficialX402Challenge,
  OfficialX402RegistrationAdapter,
  OfficialX402RouteConfig,
} from "./official-adapter";
import { createHmacQuoteAuthenticator } from "./quote-auth";
import type {
  DurableIdempotencyStore,
  DurableRegistrationRecord,
  PersistedX402Challenge,
  PreparedRegistrationPlan,
  RegistrationLease,
  RegistrationPlanRuntime,
  RegistrationReservation,
} from "./registration";
import {
  createUnsignedV3RegistrationQuote,
  signV3RegistrationQuote,
} from "./v3-quote";
import {
  executeRegistrationPlanWorkflow,
  resumeRegistrationPlanWorkflow,
} from "./workflow";

const commitTarget = getAddress("0x1111111111111111111111111111111111111111");
const controller = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const keeper = getAddress("0x4444444444444444444444444444444444444444");
const payer = getAddress("0x5555555555555555555555555555555555555555");
const commitHash = `0x${"66".repeat(32)}` as Hash;
const revealHash = `0x${"77".repeat(32)}` as Hash;
const settlementHash = `0x${"88".repeat(32)}` as Hash;
const normalizationProfileHash = `0x${"22".repeat(32)}` as const;
const labelHash = `0x${"33".repeat(32)}` as const;
const authenticator = createHmacQuoteAuthenticator({
  keyId: "plan-workflow-test",
  key: new Uint8Array(32).fill(13),
});
const typedDataTypes = {
  NormalizationAttestation: [
    { name: "chainId", type: "uint256" },
    { name: "controller", type: "address" },
    { name: "normalizationProfileHash", type: "bytes32" },
    { name: "labelHash", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "validUntil", type: "uint64" },
  ],
} as const;

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
    types: typedDataTypes,
    primaryType: "NormalizationAttestation",
    message,
  });
  const typedDataDigest = hashTypedData({
    domain,
    types: typedDataTypes,
    primaryType: "NormalizationAttestation",
    message,
  });
  const controllerAttestationHash = normalizationControllerAttestationHash(
    "1800000300",
    signature,
  );
  const unsignedQuote = createUnsignedV3RegistrationQuote({
    chainId: 84_532,
    description: "Register agent.sepbase",
    asset: token,
    amountBaseUnits: "1000000",
    payTo: keeper,
    issuedAt: "1800000000",
    expiresAt: "1800000300",
    paymentTimeoutSeconds: 270,
    normalizationTypedDataDigest: typedDataDigest,
    controllerAttestationHash,
    normalizationValidUntil: "1800000300",
  });
  const policy = {
    chainId: 84_532,
    allowNativeValue: false,
    allowlist: {
      commit: { target: commitTarget, selector: "0xaaaaaaaa" as const },
      reveal: { target: controller, selector: "0xbbbbbbbb" as const },
    },
    normalization: {
      attestor: account.address,
      controller,
      normalizationProfileHash,
    },
  };
  const plan = await buildRegistrationExecutionPlan({
    value: {
      schema: "sepbase.x402.registration-plan.v1",
      quoteId: unsignedQuote.quoteId,
      chainId: 84_532,
      network: "eip155:84532",
      normalizationAttestation: {
        schema: "sepbase.normalization-attestation.v1",
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
      },
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
  return {
    plan,
    policy,
    signedQuote: signV3RegistrationQuote({ quote: unsignedQuote, planId: plan.planId, authenticator }),
  };
}

const settlement: SettleResponse = {
  success: true,
  payer,
  transaction: settlementHash,
  network: "eip155:84532",
  amount: "1000000",
};

class FakeStore implements DurableIdempotencyStore {
  readonly durable = true as const;
  readonly distributed = true as const;
  readonly atomicCompareAndSet = true as const;
  readonly encryptedAtRest = true as const;
  readonly globalAuthorizationUniqueness = true as const;
  readonly deterministicChallengePersistence = true as const;
  readonly kind = "test-distributed-cas";
  record: DurableRegistrationRecord | null = null;
  reservation: RegistrationReservation | null = null;
  prepared: PreparedRegistrationPlan | null = null;
  challenge: PersistedX402Challenge | null = null;
  active = false;
  loseSettledTransitionResponse = false;
  lease: RegistrationLease = {
    token: "lease_1234567890abcdef",
    fencingToken: "1",
    expiresAt: "2027-01-15T08:05:00.000Z",
  };

  async loadChallenge(options: { quoteId: `sha256:${string}`; planId: `sha256:${string}` }) {
    if (!this.challenge) return null;
    if (this.challenge.quoteId !== options.quoteId || this.challenge.planId !== options.planId) return null;
    return this.challenge;
  }

  async loadReservation(options: { paymentIdentifier: string; planId: `sha256:${string}` }) {
    if (!this.reservation) return null;
    if (
      this.reservation.paymentIdentifier !== options.paymentIdentifier
      || this.reservation.planId !== options.planId
    ) return null;
    return this.reservation;
  }

  async loadRecord(options: { paymentIdentifier: string; planId: `sha256:${string}` }) {
    if (!this.record) return null;
    return this.record.paymentIdentifier === options.paymentIdentifier && this.record.planId === options.planId
      ? this.record
      : null;
  }

  async loadPreparedPlan(options: { quoteId: `sha256:${string}`; planId: `sha256:${string}` }) {
    if (!this.prepared) return null;
    return this.prepared.quoteId === options.quoteId && this.prepared.planId === options.planId
      ? this.prepared
      : null;
  }

  async persistPreparedPlan(prepared: PreparedRegistrationPlan) {
    if (!this.prepared) {
      this.prepared = prepared;
      return { outcome: "stored" as const, prepared };
    }
    if (this.prepared.planId !== prepared.planId) return { outcome: "conflict" as const };
    return { outcome: "existing" as const, prepared: this.prepared };
  }

  async persistChallenge(challenge: PersistedX402Challenge) {
    if (!this.challenge) {
      this.challenge = challenge;
      return { outcome: "stored" as const, persisted: challenge };
    }
    if (this.challenge.challengeHash !== challenge.challengeHash) return { outcome: "conflict" as const };
    return { outcome: "existing" as const, persisted: this.challenge };
  }

  async reserveOrAcquire(reservation: RegistrationReservation) {
    this.reservation ??= reservation;
    if (this.record && (
      this.record.requestFingerprint !== reservation.requestFingerprint
      || this.record.paymentAuthorizationHash !== reservation.paymentAuthorizationHash
      || this.record.planId !== reservation.planId
    )) return { outcome: "conflict" as const };
    if (this.record && (this.active || ["settled", "terminal-failure"].includes(this.record.status))) {
      return { outcome: "existing" as const, record: this.record };
    }
    this.active = true;
    this.record ??= {
      paymentIdentifier: reservation.paymentIdentifier,
      requestFingerprint: reservation.requestFingerprint,
      paymentPayloadHash: reservation.paymentPayloadHash,
      paymentAuthorizationHash: reservation.paymentAuthorizationHash,
      planId: reservation.planId,
      quoteId: reservation.quoteId,
      status: "reserved",
      version: 0,
      refundDisposition: "not-required-unsettled",
      updatedAt: "2027-01-15T08:00:00.000Z",
    };
    return { outcome: "acquired" as const, record: this.record, lease: this.lease };
  }

  async transition(options: Parameters<DurableIdempotencyStore["transition"]>[0]) {
    if (!this.record || !options.expectedStatuses.includes(this.record.status)) throw new Error("bad CAS");
    this.record = {
      ...this.record,
      ...options.patch,
      version: this.record.version + 1,
      updatedAt: "2027-01-15T08:00:01.000Z",
    };
    if (options.patch.status === "settled" && this.loseSettledTransitionResponse) {
      this.loseSettledTransitionResponse = false;
      throw new Error("CAS response lost");
    }
    return this.record;
  }

  async renew() { return this.lease; }
  async release() { this.active = false; }
}

async function setup() {
  const { plan, policy, signedQuote } = await fixture();
  const events: string[] = [];
  const store = new FakeStore();
  let currentChallenge: OfficialX402Challenge | null = null;
  const adapter: OfficialX402RegistrationAdapter = {
    protocolVersion: 2,
    implementation: "@x402/core",
    createChallenge: vi.fn(async (config: OfficialX402RouteConfig) => {
      const option = config.accepts[0]!;
      const requirement: PaymentRequirements = {
        scheme: option.scheme,
        network: option.network,
        asset: option.price.asset,
        amount: option.price.amount,
        payTo: option.payTo,
        maxTimeoutSeconds: option.maxTimeoutSeconds,
        extra: {},
      };
      const paymentRequired: PaymentRequired = {
        x402Version: 2,
        resource: {
          url: config.resource,
          description: config.description,
          mimeType: config.mimeType,
        },
        accepts: [requirement],
        extensions: config.extensions,
      };
      currentChallenge = {
        paymentRequired,
        requirement,
        paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
        declaredExtensions: config.extensions,
      };
      return currentChallenge;
    }),
    decodePayment: vi.fn(() => {
      if (!currentChallenge) throw new Error("challenge missing");
      return {
        x402Version: 2,
        resource: currentChallenge.paymentRequired.resource,
        accepted: currentChallenge.requirement,
        payload: { authorization: "signed" },
        extensions: { "payment-identifier": { info: { id: "pay_1234567890abcdef" } } },
      } satisfies PaymentPayload;
    }),
    matchPayment: vi.fn((_payment, challenge) => ({
      requirement: challenge.requirement,
      paymentIdentifier: "pay_1234567890abcdef",
    })),
    verify: vi.fn(async () => {
      events.push("verify");
      return { isValid: true, payer };
    }),
    settle: vi.fn(async () => {
      events.push("settle");
      return settlement;
    }),
    encodeSettlement: vi.fn(() => "payment-response-v2"),
  };
  const runtime: RegistrationPlanRuntime = {
    adapter,
    store,
    signer: {
      configured: true,
      address: keeper,
      provider: "external",
      broadcastStep: vi.fn(async ({ step }) => {
        events.push(`broadcast-${step}`);
        return step === "commit" ? commitHash : revealHash;
      }),
    },
    reconciler: {
      reconcileStep: vi.fn(async ({ step }) => {
        events.push(`reconcile-${step}`);
        return "confirmed" as const;
      }),
      revealReadiness: vi.fn(async () => {
        events.push("reveal-readiness");
        return "ready" as const;
      }),
    },
    planAdapter: {
      contractGeneration: "v3",
      validateBundle: vi.fn(async ({ intent, plan: candidate }) => {
        expect(intent.quoteId).toBe(candidate.quoteId);
        await assertRegistrationExecutionPlanPolicy(candidate, policy, 1_800_000_000);
      }),
      decodeAndRecomputeCalldata: vi.fn((candidate) => {
        expect(candidate.steps[0].calldata.toLowerCase())
          .toContain(candidate.normalizationAttestation.controllerAttestationHash.slice(2).toLowerCase());
        return {
          commit: candidate.steps[0].calldata,
          reveal: candidate.steps[1].calldata,
          controllerAttestationHash:
            candidate.normalizationAttestation.controllerAttestationHash,
        };
      }),
    },
    quoteAuthenticator: authenticator,
  };
  const run = (
    paymentSignatureHeader: string | null = "signed-payment",
    nowSeconds = 1_800_000_030,
  ) => executeRegistrationPlanWorkflow({
    runtime,
    signedQuoteValue: signedQuote,
    plan,
    siteOrigin: "https://names.example",
    nowSeconds,
    paymentSignatureHeader,
    leaseSeconds: 300,
  });
  return { run, runtime, store, events, signedQuote, plan };
}

describe("V3 commit/reveal x402 workflow infrastructure", () => {
  it("persists one byte-stable challenge before returning payment-required", async () => {
    const { run, runtime, store } = await setup();
    const first = await run(null);
    const second = await run(null, 1_800_000_090);
    expect(first).toEqual(second);
    expect(store.challenge?.challenge.paymentRequiredHeader).toBe(
      first.kind === "payment-required" ? first.paymentRequiredHeader : "",
    );
    expect(runtime.adapter.createChallenge).toHaveBeenCalledTimes(1);
    expect(runtime.signer.broadcastStep).not.toHaveBeenCalled();
    expect(store.record).toBeNull();
  });

  it("authenticates every signed quote field before challenge or payment work", async () => {
    const { runtime, signedQuote, plan } = await setup();
    await expect(executeRegistrationPlanWorkflow({
      runtime,
      signedQuoteValue: { ...signedQuote, amountBaseUnits: "1000001" },
      plan,
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
      paymentSignatureHeader: null,
      leaseSeconds: 300,
    })).rejects.toMatchObject({ code: "V3_QUOTE_AUTHENTICATION_FAILED" });
    expect(runtime.adapter.createChallenge).not.toHaveBeenCalled();
  });

  it("orders commit, confirmed reveal, and only then settlement", async () => {
    const { run, events, store } = await setup();
    await expect(run()).resolves.toMatchObject({
      kind: "settled",
      record: { status: "settled", commitTransaction: commitHash, revealTransaction: revealHash },
    });
    expect(events).toEqual([
      "verify",
      "broadcast-commit",
      "reconcile-commit",
      "reveal-readiness",
      "broadcast-reveal",
      "reconcile-reveal",
      "settle",
    ]);
    expect(store.record?.refundDisposition).toBe("not-applicable-registered");
  });

  it("resumes an encrypted verified order without the original HTTP payment header", async () => {
    const { runtime, signedQuote, plan, store, events } = await setup();
    await expect(executeRegistrationPlanWorkflow({
      runtime,
      signedQuoteValue: signedQuote,
      plan,
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
      paymentSignatureHeader: "signed-payment",
      leaseSeconds: 300,
      deferExecution: true,
    })).resolves.toMatchObject({ kind: "pending", record: { status: "verified" } });
    expect(runtime.signer.broadcastStep).not.toHaveBeenCalled();
    expect(store.reservation?.signedQuote).toEqual(signedQuote);

    await expect(resumeRegistrationPlanWorkflow({
      runtime,
      paymentIdentifier: "pay_1234567890abcdef",
      planId: plan.planId,
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_031,
    })).resolves.toMatchObject({ kind: "settled", record: { status: "settled" } });
    expect(events).toEqual([
      "verify",
      "verify",
      "broadcast-commit",
      "reconcile-commit",
      "reveal-readiness",
      "broadcast-reveal",
      "reconcile-reveal",
      "settle",
    ]);
  });

  it("never settles a mismatched reveal transaction", async () => {
    const { run, runtime, store } = await setup();
    vi.mocked(runtime.reconciler.reconcileStep)
      .mockResolvedValueOnce("confirmed")
      .mockResolvedValueOnce("mismatch");
    await expect(run()).rejects.toMatchObject({ code: "REGISTRATION_TERMINAL_FAILURE" });
    expect(runtime.adapter.settle).not.toHaveBeenCalled();
    expect(store.record).toMatchObject({ status: "terminal-failure", errorCode: "REVEAL_TRANSACTION_MISMATCH" });
  });

  it("reconciles a settlement timeout without rebroadcasting execution steps", async () => {
    const { run, runtime, store } = await setup();
    vi.mocked(runtime.adapter.settle)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(settlement);
    await expect(run()).rejects.toMatchObject({ code: "REGISTRATION_RECONCILIATION_REQUIRED" });
    expect(store.record?.status).toBe("reconciliation-required");
    await expect(run()).resolves.toMatchObject({ kind: "settled", replayed: true });
    expect(runtime.signer.broadcastStep).toHaveBeenCalledTimes(2);
  });

  it("does not settle twice when CAS applies but its response is lost", async () => {
    const { run, runtime, store } = await setup();
    store.loseSettledTransitionResponse = true;
    await expect(run()).rejects.toThrow("CAS response lost");
    expect(store.record?.status).toBe("settled");
    await expect(run()).resolves.toMatchObject({ kind: "settled", replayed: true });
    expect(runtime.adapter.settle).toHaveBeenCalledTimes(1);
  });

  it("asserts runtime capabilities before parsing attacker-controlled quote input", async () => {
    const { runtime, plan } = await setup();
    const invalidRuntime = {
      ...runtime,
      store: { ...runtime.store, deterministicChallengePersistence: false },
    } as unknown as RegistrationPlanRuntime;
    await expect(executeRegistrationPlanWorkflow({
      runtime: invalidRuntime,
      signedQuoteValue: null,
      plan,
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
      paymentSignatureHeader: null,
      leaseSeconds: 300,
    })).rejects.toMatchObject({ code: "DURABLE_STORE_REQUIRED" });
  });
});
