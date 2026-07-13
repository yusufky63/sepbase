import type { SettleResponse } from "@x402/core/types";
import { type Address, type Hash } from "viem";
import { z } from "zod";
import { X402RegistrationError } from "./errors";
import {
  NORMALIZATION_ATTESTATION_DOMAIN_NAME,
  NORMALIZATION_ATTESTATION_DOMAIN_VERSION,
} from "./constants";
import {
  assertRegistrationExecutionPlanPolicy,
  assertNormalizationAttestation,
  executionStep,
  type RegistrationExecutionPlanPolicy,
} from "./execution-plan";
import {
  assertExecutionPlanCalldataRecomputed,
  type PersistedX402Challenge,
  type PreparedRegistrationPlan,
  type ConfiguredPlanSigner,
  type DurableIdempotencyStore,
  type DurableRegistrationRecord,
  type RegistrationJobStatus,
  type RegistrationLease,
  type RegistrationReservation,
} from "./registration";
import type { NormalizationAttestation, RegistrationExecutionStepKind } from "./types";

type Fetch = typeof fetch;

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const statusSchema = z.enum([
  "reserved",
  "verified",
  "commit-submitted",
  "reveal-ready",
  "reveal-submitted",
  "confirmed",
  "reconciliation-required",
  "settled",
  "terminal-failure",
]);
const settlementSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  errorMessage: z.string().optional(),
  payer: z.string().optional(),
  transaction: z.string(),
  network: z.string().regex(/^[a-z0-9]+:[A-Za-z0-9._-]+$/),
  amount: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
}).strict();
const recordSchema = z.object({
  paymentIdentifier: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
  requestFingerprint: sha256Schema,
  paymentPayloadHash: sha256Schema,
  paymentAuthorizationHash: sha256Schema,
  planId: sha256Schema,
  status: statusSchema,
  quoteId: sha256Schema,
  version: z.number().int().nonnegative(),
  refundDisposition: z.enum([
    "not-required-unsettled",
    "not-applicable-registered",
    "manual-review",
  ]),
  commitTransaction: hashSchema.optional(),
  revealTransaction: hashSchema.optional(),
  settlementTransaction: hashSchema.optional(),
  settlementResponse: settlementSchema.optional(),
  errorCode: z.string().min(1).max(96).regex(/^[A-Z0-9_]+$/).optional(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();
const leaseSchema = z.object({
  token: z.string().min(16).max(512),
  fencingToken: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
const storeCapabilitiesSchema = z.object({
  durable: z.literal(true),
  distributed: z.literal(true),
  atomicCompareAndSet: z.literal(true),
  encryptedAtRest: z.literal(true),
  globalAuthorizationUniqueness: z.literal(true),
  deterministicChallengePersistence: z.literal(true),
  fencingLeases: z.literal(true),
}).strict();
const reserveResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("acquired"),
    capabilities: storeCapabilitiesSchema,
    record: recordSchema,
    lease: leaseSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("existing"),
    capabilities: storeCapabilitiesSchema,
    record: recordSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("conflict"),
    capabilities: storeCapabilitiesSchema,
  }).strict(),
]);
const reservationSchema = z.object({
  paymentIdentifier: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
  requestFingerprint: sha256Schema,
  paymentPayloadHash: sha256Schema,
  paymentAuthorizationHash: sha256Schema,
  planId: sha256Schema,
  quoteId: sha256Schema,
  paymentPayload: z.unknown(),
  signedQuote: z.unknown(),
  executionPlan: z.unknown(),
  leaseSeconds: z.number().int().min(60).max(900),
}).strict();
const preparedPlanSchema = z.object({
  quoteId: sha256Schema,
  planId: sha256Schema,
  signedQuote: z.unknown(),
  executionPlan: z.unknown(),
  expiresAt: z.string().regex(/^[1-9]\d*$/),
}).strict();
const loadPreparedPlanResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("found"),
    capabilities: storeCapabilitiesSchema,
    prepared: preparedPlanSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("missing"),
    capabilities: storeCapabilitiesSchema,
  }).strict(),
]);
const persistPreparedPlanResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.enum(["stored", "existing"]),
    prepared: preparedPlanSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("conflict"),
  }).strict(),
]);
const loadReservationResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("found"),
    capabilities: storeCapabilitiesSchema,
    reservation: reservationSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("missing"),
    capabilities: storeCapabilitiesSchema,
  }).strict(),
]);
const loadRecordResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("found"),
    capabilities: storeCapabilitiesSchema,
    record: recordSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("missing"),
    capabilities: storeCapabilitiesSchema,
  }).strict(),
]);
const transitionResponseSchema = z.object({
  schema: z.literal("sepbase.x402.idempotency.v1"),
  outcome: z.literal("updated"),
  record: recordSchema,
}).strict();
const renewResponseSchema = z.object({
  schema: z.literal("sepbase.x402.idempotency.v1"),
  outcome: z.literal("renewed"),
  lease: leaseSchema,
}).strict();
const releaseResponseSchema = z.object({
  schema: z.literal("sepbase.x402.idempotency.v1"),
  outcome: z.literal("released"),
}).strict();
const persistedChallengeSchema = z.object({
  quoteId: sha256Schema,
  planId: sha256Schema,
  challengeHash: sha256Schema,
  challenge: z.object({
    paymentRequired: z.unknown(),
    requirement: z.unknown(),
    paymentRequiredHeader: z.string().min(1).max(128 * 1024),
    declaredExtensions: z.record(z.string(), z.unknown()),
  }).strict(),
}).strict();
const loadChallengeResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("found"),
    persisted: persistedChallengeSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("missing"),
  }).strict(),
]);
const persistChallengeResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.enum(["stored", "existing"]),
    persisted: persistedChallengeSchema,
  }).strict(),
  z.object({
    schema: z.literal("sepbase.x402.idempotency.v1"),
    outcome: z.literal("conflict"),
  }).strict(),
]);
const signerResponseSchema = z.object({
  schema: z.literal("sepbase.x402.managed-plan-signer.v1"),
  signer: addressSchema,
  chainId: z.number().int().positive(),
  planId: sha256Schema,
  step: z.enum(["commit", "reveal"]),
  requestFingerprint: sha256Schema,
  transactionHash: hashSchema,
  spendingPolicy: z.object({
    settlementAsset: addressSchema,
    controller: addressSchema,
    maxOrderBaseUnits: z.string().regex(/^[1-9]\d*$/),
    dailyLimitBaseUnits: z.string().regex(/^[1-9]\d*$/),
  }).strict(),
}).strict();
const normalizationAttestationSchema = z.object({
  schema: z.literal("sepbase.normalization-attestation.v1"),
  domain: z.object({
    name: z.literal(NORMALIZATION_ATTESTATION_DOMAIN_NAME),
    version: z.literal(NORMALIZATION_ATTESTATION_DOMAIN_VERSION),
  }).strict(),
  claims: z.object({
    chainId: z.number().int().positive(),
    controller: addressSchema,
    normalizationProfileHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    labelHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recipient: addressSchema,
    validUntil: z.string().regex(/^[1-9]\d*$/),
  }).strict(),
  typedDataDigest: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  controllerAttestationHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
}).strict();
const attestationIssuerResponseSchema = z.object({
  schema: z.literal("sepbase.normalization-attestation-issuer.v1"),
  attestation: normalizationAttestationSchema,
}).strict();

async function postJson(options: {
  fetchImpl: Fetch;
  url: string;
  authToken: string;
  timeoutMs: number;
  body: unknown;
  headers?: Record<string, string>;
  errorCode: string;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(options.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.authToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(options.body),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new X402RegistrationError(503, options.errorCode, "A required x402 runtime service is unavailable.");
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw new X402RegistrationError(503, options.errorCode, "A required x402 runtime service returned an invalid response.");
    }
  } catch (error) {
    if (error instanceof X402RegistrationError) throw error;
    throw new X402RegistrationError(503, options.errorCode, "A required x402 runtime service is unavailable.");
  } finally {
    clearTimeout(timer);
  }
}

function assertRecordBindings(record: DurableRegistrationRecord, reservation: RegistrationReservation) {
  if (
    record.paymentIdentifier !== reservation.paymentIdentifier
    || record.requestFingerprint !== reservation.requestFingerprint
    || record.paymentPayloadHash !== reservation.paymentPayloadHash
    || record.paymentAuthorizationHash !== reservation.paymentAuthorizationHash
    || record.planId !== reservation.planId
    || record.quoteId !== reservation.quoteId
  ) {
    throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned an inconsistent record.");
  }
}

function reservationBinding(reservation: RegistrationReservation) {
  const {
    paymentPayload: _paymentPayload,
    signedQuote: _signedQuote,
    executionPlan: _executionPlan,
    ...binding
  } = reservation;
  void _paymentPayload;
  void _signedQuote;
  void _executionPlan;
  return binding;
}

export class ExternalDurableIdempotencyStore implements DurableIdempotencyStore {
  readonly durable = true as const;
  readonly distributed = true as const;
  readonly atomicCompareAndSet = true as const;
  readonly encryptedAtRest = true as const;
  readonly globalAuthorizationUniqueness = true as const;
  readonly deterministicChallengePersistence = true as const;
  readonly kind = "external-cas";

  constructor(readonly options: {
    url: string;
    authToken: string;
    timeoutMs: number;
    fetchImpl?: Fetch;
  }) {}

  async #call(body: unknown) {
    return postJson({
      fetchImpl: this.options.fetchImpl ?? fetch,
      url: this.options.url,
      authToken: this.options.authToken,
      timeoutMs: this.options.timeoutMs,
      body,
      errorCode: "DURABLE_STORE_UNAVAILABLE",
    });
  }

  async loadReservation(options: {
    paymentIdentifier: string;
    planId: `sha256:${string}`;
  }) {
    const result = loadReservationResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "load-registration-plan",
      ...options,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned an invalid encrypted plan response.");
    }
    if (result.data.outcome === "missing") return null;
    const reservation = result.data.reservation as RegistrationReservation;
    if (
      reservation.paymentIdentifier !== options.paymentIdentifier
      || reservation.planId !== options.planId
    ) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned a plan with inconsistent bindings.");
    }
    return reservation;
  }

  async loadRecord(options: {
    paymentIdentifier: string;
    planId: `sha256:${string}`;
  }) {
    const result = loadRecordResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "load-registration-record",
      ...options,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned an invalid order-status response.");
    }
    if (result.data.outcome === "missing") return null;
    const record = result.data.record as DurableRegistrationRecord;
    if (record.paymentIdentifier !== options.paymentIdentifier || record.planId !== options.planId) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned an order status with inconsistent bindings.");
    }
    return record;
  }

  async loadPreparedPlan(options: {
    quoteId: `sha256:${string}`;
    planId: `sha256:${string}`;
  }) {
    const result = loadPreparedPlanResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "load-prepared-registration-plan",
      ...options,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned an invalid prepared-plan response.");
    }
    if (result.data.outcome === "missing") return null;
    const prepared = result.data.prepared as PreparedRegistrationPlan;
    if (prepared.quoteId !== options.quoteId || prepared.planId !== options.planId) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned a prepared plan with inconsistent bindings.");
    }
    return prepared;
  }

  async persistPreparedPlan(prepared: PreparedRegistrationPlan) {
    const result = persistPreparedPlanResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "persist-prepared-registration-plan",
      prepared,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store rejected prepared-plan persistence.");
    }
    if (result.data.outcome === "conflict") return { outcome: "conflict" as const };
    const persisted = result.data.prepared as PreparedRegistrationPlan;
    if (persisted.quoteId !== prepared.quoteId || persisted.planId !== prepared.planId) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store persisted a prepared plan with inconsistent bindings.");
    }
    return { outcome: result.data.outcome, prepared: persisted };
  }

  async reserveOrAcquire(reservation: RegistrationReservation) {
    const result = reserveResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "reserve-or-acquire-plan",
      reservation,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned an invalid response.");
    }
    if (result.data.outcome !== "conflict") {
      assertRecordBindings(result.data.record as DurableRegistrationRecord, reservation);
    }
    return result.data as
      | { outcome: "acquired"; record: DurableRegistrationRecord; lease: RegistrationLease }
      | { outcome: "existing"; record: DurableRegistrationRecord }
      | { outcome: "conflict" };
  }

  async transition(options: {
    reservation: RegistrationReservation;
    lease: RegistrationLease;
    expectedStatuses: RegistrationJobStatus[];
    patch: Parameters<DurableIdempotencyStore["transition"]>[0]["patch"];
  }) {
    const result = transitionResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "compare-and-set-plan",
      reservation: reservationBinding(options.reservation),
      lease: options.lease,
      expectedStatuses: options.expectedStatuses,
      patch: options.patch,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store rejected an atomic transition.");
    }
    const record = result.data.record as DurableRegistrationRecord;
    assertRecordBindings(record, options.reservation);
    if (options.patch.status && record.status !== options.patch.status) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store did not apply an atomic transition.");
    }
    return record;
  }

  async renew(options: { reservation: RegistrationReservation; lease: RegistrationLease }) {
    const result = renewResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "renew-plan-lease",
      reservation: reservationBinding(options.reservation),
      lease: options.lease,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store could not renew the lease.");
    }
    return result.data.lease;
  }

  async release(options: { reservation: RegistrationReservation; lease: RegistrationLease }) {
    const result = releaseResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "release-plan-lease",
      reservation: reservationBinding(options.reservation),
      lease: options.lease,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store could not release the lease.");
    }
  }

  async loadChallenge(options: {
    quoteId: `sha256:${string}`;
    planId: `sha256:${string}`;
  }) {
    const result = loadChallengeResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "load-registration-challenge",
      ...options,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store returned an invalid challenge response.");
    }
    return result.data.outcome === "missing"
      ? null
      : result.data.persisted as PersistedX402Challenge;
  }

  async persistChallenge(challenge: PersistedX402Challenge) {
    const result = persistChallengeResponseSchema.safeParse(await this.#call({
      schema: "sepbase.x402.idempotency.v1",
      operation: "persist-registration-challenge",
      persisted: challenge,
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable store rejected challenge persistence.");
    }
    if (result.data.outcome === "conflict") return { outcome: "conflict" as const };
    return {
      outcome: result.data.outcome,
      persisted: result.data.persisted as PersistedX402Challenge,
    };
  }
}

export class ExternalManagedPlanSigner implements ConfiguredPlanSigner {
  readonly configured = true as const;

  constructor(readonly options: {
    url: string;
    authToken: string;
    timeoutMs: number;
    address: Address;
    provider: string;
    limits: {
      settlementAsset: Address;
      controller: Address;
      maxOrderBaseUnits: bigint;
      dailyLimitBaseUnits: bigint;
    };
    policy: RegistrationExecutionPlanPolicy;
    decodeAndRecomputeCalldata(plan: RegistrationReservation["executionPlan"]):
      | { commit: `0x${string}`; reveal: `0x${string}`; controllerAttestationHash: `0x${string}` }
      | Promise<{
        commit: `0x${string}`;
        reveal: `0x${string}`;
        controllerAttestationHash: `0x${string}`;
      }>;
    fetchImpl?: Fetch;
  }) {}

  get address() {
    return this.options.address;
  }

  get provider() {
    return this.options.provider;
  }

  async broadcastStep(options: {
    plan: RegistrationReservation["executionPlan"];
    step: RegistrationExecutionStepKind;
    paymentIdentifier: string;
    requestFingerprint: string;
    fencingToken: string;
  }) {
    await assertRegistrationExecutionPlanPolicy(options.plan, this.options.policy);
    await assertExecutionPlanCalldataRecomputed({
      plan: options.plan,
      decodeAndRecomputeCalldata: this.options.decodeAndRecomputeCalldata,
    });
    const step = executionStep(options.plan, options.step);
    const result = signerResponseSchema.safeParse(await postJson({
      fetchImpl: this.options.fetchImpl ?? fetch,
      url: this.options.url,
      authToken: this.options.authToken,
      timeoutMs: this.options.timeoutMs,
      errorCode: "KEEPER_SIGNER_UNAVAILABLE",
      headers: {
        "Idempotency-Key": `${options.paymentIdentifier}:${options.step}`,
        "X-Fencing-Token": options.fencingToken,
        "X-Execution-Plan": options.plan.planId,
      },
      body: {
        schema: "sepbase.x402.managed-plan-signer.v1",
        operation: "broadcast-registration-step",
        chainId: options.plan.chainId,
        paymentIdentifier: options.paymentIdentifier,
        requestFingerprint: options.requestFingerprint,
        planId: options.plan.planId,
        quoteId: options.plan.quoteId,
        step: options.step,
        fencingToken: options.fencingToken,
        expectedSigner: this.address,
        spendingPolicy: {
          settlementAsset: this.options.limits.settlementAsset,
          controller: this.options.limits.controller,
          maxOrderBaseUnits: this.options.limits.maxOrderBaseUnits.toString(),
          dailyLimitBaseUnits: this.options.limits.dailyLimitBaseUnits.toString(),
        },
        transaction: {
          target: step.target,
          selector: step.selector,
          calldata: step.calldata,
          valueBaseUnits: step.valueBaseUnits,
        },
      },
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "KEEPER_SIGNER_PROTOCOL_ERROR", "The managed signer returned an invalid response.");
    }
    if (
      result.data.signer.toLowerCase() !== this.address.toLowerCase()
      || result.data.chainId !== options.plan.chainId
      || result.data.planId !== options.plan.planId
      || result.data.step !== options.step
      || result.data.requestFingerprint !== options.requestFingerprint
      || result.data.spendingPolicy.settlementAsset.toLowerCase()
        !== this.options.limits.settlementAsset.toLowerCase()
      || result.data.spendingPolicy.controller.toLowerCase()
        !== this.options.limits.controller.toLowerCase()
      || result.data.spendingPolicy.maxOrderBaseUnits
        !== this.options.limits.maxOrderBaseUnits.toString()
      || result.data.spendingPolicy.dailyLimitBaseUnits
        !== this.options.limits.dailyLimitBaseUnits.toString()
    ) {
      throw new X402RegistrationError(503, "KEEPER_SIGNER_BINDING_MISMATCH", "The managed signer response was not bound to this plan step.");
    }
    return result.data.transactionHash as Hash;
  }
}

/**
 * Requests canonical claims from a separate managed attestation service. The
 * caller supplies only raw label context and recipient; labelHash, profile hash,
 * validity and signature are server-authored and locally signature-verified.
 */
export class ExternalNormalizationAttestationIssuer {
  constructor(readonly options: {
    url: string;
    authToken: string;
    timeoutMs: number;
    profileReference: string;
    policy: RegistrationExecutionPlanPolicy;
    fetchImpl?: Fetch;
  }) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(options.profileReference)) {
      throw new X402RegistrationError(503, "ATTESTATION_ISSUER_NOT_CONFIGURED", "The normalization attestation issuer is not configured.");
    }
  }

  async issue(options: { rawLabel: string; recipient: Address; nowSeconds?: number }) {
    if (!options.rawLabel || options.rawLabel.length > 256) {
      throw new X402RegistrationError(400, "INVALID_LABEL", "The raw label context is invalid.");
    }
    const result = attestationIssuerResponseSchema.safeParse(await postJson({
      fetchImpl: this.options.fetchImpl ?? fetch,
      url: this.options.url,
      authToken: this.options.authToken,
      timeoutMs: this.options.timeoutMs,
      errorCode: "ATTESTATION_ISSUER_UNAVAILABLE",
      body: {
        schema: "sepbase.normalization-attestation-request.v1",
        operation: "issue-normalization-attestation",
        rawLabel: options.rawLabel,
        recipient: options.recipient,
        chainId: this.options.policy.chainId,
        controller: this.options.policy.normalization.controller,
        profileReference: this.options.profileReference,
      },
    }));
    if (!result.success) {
      throw new X402RegistrationError(503, "ATTESTATION_ISSUER_PROTOCOL_ERROR", "The normalization attestation issuer returned an invalid response.");
    }
    const attestation = result.data.attestation as NormalizationAttestation;
    if (attestation.claims.recipient.toLowerCase() !== options.recipient.toLowerCase()) {
      throw new X402RegistrationError(503, "NORMALIZATION_ATTESTATION_SCOPE_MISMATCH", "The attestation recipient does not match the request.");
    }
    await assertNormalizationAttestation(
      attestation,
      this.options.policy,
      options.nowSeconds,
    );
    return attestation;
  }
}

export type { SettleResponse };
