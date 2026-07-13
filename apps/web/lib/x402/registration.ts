import { createHash } from "node:crypto";
import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import type { Address, Hash, Hex } from "viem";
import { X402RegistrationError } from "./errors";
import type {
  OfficialX402Challenge,
  OfficialX402RegistrationAdapter,
} from "./official-adapter";
import type { RegistrationQuoteAuthenticator } from "./quote-auth";
import type {
  RegistrationExecutionPlan,
  RegistrationExecutionStepKind,
  RegistrationRefundDisposition,
  X402RegistrationPaymentIntent,
} from "./types";

export type RegistrationJobStatus =
  | "reserved"
  | "verified"
  | "commit-submitted"
  | "reveal-ready"
  | "reveal-submitted"
  | "confirmed"
  | "reconciliation-required"
  | "settled"
  | "terminal-failure";

export type DurableRegistrationRecord = {
  paymentIdentifier: string;
  requestFingerprint: string;
  paymentPayloadHash: string;
  paymentAuthorizationHash: string;
  planId: string;
  status: RegistrationJobStatus;
  quoteId: string;
  version: number;
  refundDisposition: RegistrationRefundDisposition;
  commitTransaction?: Hash;
  revealTransaction?: Hash;
  settlementTransaction?: Hash;
  settlementResponse?: SettleResponse;
  errorCode?: string;
  updatedAt: string;
};

export type RegistrationLease = {
  token: string;
  fencingToken: string;
  expiresAt: string;
};

export type RegistrationReservation = {
  paymentIdentifier: string;
  requestFingerprint: string;
  paymentPayloadHash: string;
  paymentAuthorizationHash: string;
  planId: string;
  quoteId: string;
  /** Stored encrypted-at-rest for autonomous settlement reconciliation. */
  paymentPayload: PaymentPayload;
  /** Stored encrypted-at-rest so every durable continuation re-authenticates the exact quote. */
  signedQuote: unknown;
  /** Stored encrypted-at-rest so commit/reveal can resume after process loss. */
  executionPlan: RegistrationExecutionPlan;
  leaseSeconds: number;
};

export type PersistedX402Challenge = {
  quoteId: `sha256:${string}`;
  planId: `sha256:${string}`;
  challengeHash: `sha256:${string}`;
  challenge: OfficialX402Challenge;
};

export type PreparedRegistrationPlan = {
  quoteId: `sha256:${string}`;
  planId: `sha256:${string}`;
  signedQuote: unknown;
  executionPlan: RegistrationExecutionPlan;
  expiresAt: string;
};

export type RegistrationRecordPatch = Partial<Pick<
  DurableRegistrationRecord,
  | "status"
  | "refundDisposition"
  | "commitTransaction"
  | "revealTransaction"
  | "settlementTransaction"
  | "settlementResponse"
  | "errorCode"
>>;

export interface DurableIdempotencyStore {
  readonly durable: true;
  readonly distributed: true;
  readonly atomicCompareAndSet: true;
  readonly encryptedAtRest: true;
  readonly globalAuthorizationUniqueness: true;
  readonly deterministicChallengePersistence: true;
  readonly kind: string;
  loadRecord(options: {
    paymentIdentifier: string;
    planId: `sha256:${string}`;
  }): Promise<DurableRegistrationRecord | null>;
  loadPreparedPlan(options: {
    quoteId: `sha256:${string}`;
    planId: `sha256:${string}`;
  }): Promise<PreparedRegistrationPlan | null>;
  persistPreparedPlan(plan: PreparedRegistrationPlan): Promise<
    | { outcome: "stored" | "existing"; prepared: PreparedRegistrationPlan }
    | { outcome: "conflict" }
  >;
  loadReservation(options: {
    paymentIdentifier: string;
    planId: `sha256:${string}`;
  }): Promise<RegistrationReservation | null>;
  reserveOrAcquire(reservation: RegistrationReservation): Promise<
    | { outcome: "acquired"; record: DurableRegistrationRecord; lease: RegistrationLease }
    | { outcome: "existing"; record: DurableRegistrationRecord }
    | { outcome: "conflict" }
  >;
  transition(options: {
    reservation: RegistrationReservation;
    lease: RegistrationLease;
    expectedStatuses: RegistrationJobStatus[];
    patch: RegistrationRecordPatch;
  }): Promise<DurableRegistrationRecord>;
  renew(options: {
    reservation: RegistrationReservation;
    lease: RegistrationLease;
  }): Promise<RegistrationLease>;
  release(options: {
    reservation: RegistrationReservation;
    lease: RegistrationLease;
  }): Promise<void>;
  loadChallenge(options: {
    quoteId: `sha256:${string}`;
    planId: `sha256:${string}`;
  }): Promise<PersistedX402Challenge | null>;
  persistChallenge(challenge: PersistedX402Challenge): Promise<
    | { outcome: "stored" | "existing"; persisted: PersistedX402Challenge }
    | { outcome: "conflict" }
  >;
}

export interface ConfiguredPlanSigner {
  readonly configured: true;
  readonly address: Address;
  readonly provider: string;
  broadcastStep(options: {
    plan: RegistrationExecutionPlan;
    step: RegistrationExecutionStepKind;
    paymentIdentifier: string;
    requestFingerprint: string;
    fencingToken: string;
  }): Promise<Hash>;
}

export interface RegistrationPlanReconciler {
  reconcileStep(options: {
    plan: RegistrationExecutionPlan;
    step: RegistrationExecutionStepKind;
    transactionHash: Hash;
    expectedSigner: Address;
  }): Promise<"confirmed" | "pending" | "reverted" | "mismatch">;
  revealReadiness(options: {
    plan: RegistrationExecutionPlan;
    commitTransaction: Hash;
  }): Promise<"waiting" | "ready" | "expired">;
}

export interface RegistrationExecutionPlanAdapter {
  readonly contractGeneration: "v3";
  validateBundle(bundle: {
    intent: X402RegistrationPaymentIntent;
    plan: RegistrationExecutionPlan;
  }): void | Promise<void>;
  decodeAndRecomputeCalldata(plan: RegistrationExecutionPlan):
    | { commit: Hex; reveal: Hex; controllerAttestationHash: Hex }
    | Promise<{ commit: Hex; reveal: Hex; controllerAttestationHash: Hex }>;
}

export type RegistrationPlanRuntime = {
  adapter: OfficialX402RegistrationAdapter;
  store: DurableIdempotencyStore;
  signer: ConfiguredPlanSigner;
  reconciler: RegistrationPlanReconciler;
  planAdapter: RegistrationExecutionPlanAdapter;
  quoteAuthenticator: RegistrationQuoteAuthenticator;
};

export function assertRegistrationPlanRuntime(
  runtime: RegistrationPlanRuntime,
  bindings?: { keeperAddress: Address; payTo: Address },
) {
  const storeKind = runtime.store.kind.trim().toLowerCase();
  if (
    runtime.store.durable !== true
    || runtime.store.distributed !== true
    || runtime.store.atomicCompareAndSet !== true
    || runtime.store.encryptedAtRest !== true
    || runtime.store.globalAuthorizationUniqueness !== true
    || runtime.store.deterministicChallengePersistence !== true
    || typeof runtime.store.loadChallenge !== "function"
    || typeof runtime.store.persistChallenge !== "function"
    || typeof runtime.store.loadPreparedPlan !== "function"
    || typeof runtime.store.persistPreparedPlan !== "function"
    || typeof runtime.store.loadRecord !== "function"
    || !storeKind
    || storeKind === "memory"
    || storeKind === "in-memory"
  ) {
    throw new X402RegistrationError(
      503,
      "DURABLE_STORE_REQUIRED",
      "Commit/reveal execution requires a distributed encrypted atomic store with authorization-level uniqueness.",
    );
  }
  if (runtime.adapter.protocolVersion !== 2 || runtime.adapter.implementation !== "@x402/core") {
    throw new X402RegistrationError(503, "X402_ADAPTER_REQUIRED", "The official x402 V2 adapter is required.");
  }
  if (runtime.planAdapter.contractGeneration !== "v3") {
    throw new X402RegistrationError(503, "V3_EXECUTION_PLAN_ADAPTER_REQUIRED", "A V3 commit/reveal plan adapter is required.");
  }
  if (
    typeof runtime.planAdapter.validateBundle !== "function"
    || typeof runtime.planAdapter.decodeAndRecomputeCalldata !== "function"
  ) {
    throw new X402RegistrationError(503, "V3_EXECUTION_PLAN_ADAPTER_REQUIRED", "The V3 plan adapter is incomplete.");
  }
  if (
    runtime.quoteAuthenticator.algorithm !== "hmac-sha256"
    || !runtime.quoteAuthenticator.keyId
    || typeof runtime.quoteAuthenticator.verify !== "function"
  ) {
    throw new X402RegistrationError(503, "QUOTE_AUTHENTICATION_NOT_CONFIGURED", "The signed quote authenticator is unavailable.");
  }
  if (runtime.signer.configured !== true || !runtime.signer.provider.trim()) {
    throw new X402RegistrationError(503, "KEEPER_SIGNER_REQUIRED", "A configured managed plan signer is required.");
  }
  if (bindings && (
    runtime.signer.address.toLowerCase() !== bindings.keeperAddress.toLowerCase()
    || runtime.signer.address.toLowerCase() !== bindings.payTo.toLowerCase()
  )) {
    throw new X402RegistrationError(
      503,
      "KEEPER_BINDING_MISMATCH",
      "The managed signer, keeper, and payment receiver must be the same address.",
    );
  }
}

export async function assertExecutionPlanCalldataRecomputed(options: {
  plan: RegistrationExecutionPlan;
  decodeAndRecomputeCalldata: RegistrationExecutionPlanAdapter["decodeAndRecomputeCalldata"];
}) {
  const recomputed = await options.decodeAndRecomputeCalldata(options.plan);
  const commit = options.plan.steps[0].calldata.toLowerCase();
  const reveal = options.plan.steps[1].calldata.toLowerCase();
  if (
    recomputed.commit.toLowerCase() !== commit
    || recomputed.reveal.toLowerCase() !== reveal
    || recomputed.controllerAttestationHash.toLowerCase()
      !== options.plan.normalizationAttestation.controllerAttestationHash.toLowerCase()
  ) {
    throw new X402RegistrationError(
      503,
      "EXECUTION_PLAN_CALLDATA_MISMATCH",
      "The execution-plan calldata could not be decoded and recomputed exactly.",
    );
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Unsupported JSON value");
}

export function paymentPayloadHash(payment: PaymentPayload) {
  return `sha256:${createHash("sha256").update(stableJson(payment)).digest("hex")}`;
}

export function paymentAuthorizationHash(payment: PaymentPayload) {
  return `sha256:${createHash("sha256").update(stableJson([
    payment.x402Version,
    payment.accepted.scheme,
    payment.accepted.network,
    payment.accepted.asset.toLowerCase(),
    payment.accepted.amount,
    payment.accepted.payTo.toLowerCase(),
    payment.payload,
  ])).digest("hex")}`;
}

export function registrationRequestFingerprint(options: {
  intent: X402RegistrationPaymentIntent;
  plan: RegistrationExecutionPlan;
}) {
  return `sha256:${createHash("sha256").update(stableJson([
    options.intent.quoteId,
    options.intent.planId,
    options.intent.chainId,
    options.intent.network,
    options.intent.resourcePath,
    options.intent.asset.toLowerCase(),
    options.intent.amountBaseUnits,
    options.intent.payTo.toLowerCase(),
    options.intent.issuedAt,
    options.intent.expiresAt,
    options.intent.paymentTimeoutSeconds,
    options.intent.normalizationTypedDataDigest?.toLowerCase() ?? null,
    options.intent.controllerAttestationHash?.toLowerCase() ?? null,
    options.intent.normalizationValidUntil,
    options.plan.planId,
  ])).digest("hex")}`;
}
