import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import type { Hash } from "viem";
import { X402RegistrationError, isX402RegistrationError } from "./errors";
import {
  assertOfficialX402ChallengeMatchesConfig,
  buildOfficialX402RouteConfig,
  officialX402ChallengeHash,
  type OfficialX402Challenge,
  type OfficialX402RouteConfig,
} from "./official-adapter";
import {
  assertExecutionPlanCalldataRecomputed,
  assertRegistrationPlanRuntime,
  paymentAuthorizationHash,
  paymentPayloadHash,
  registrationRequestFingerprint,
  type DurableRegistrationRecord,
  type RegistrationJobStatus,
  type RegistrationLease,
  type RegistrationPlanRuntime,
  type RegistrationReservation,
} from "./registration";
import type { RegistrationExecutionPlan } from "./types";
import { parseAndValidateV3RegistrationQuote } from "./v3-quote";

export type RegistrationPlanWorkflowResult =
  | { kind: "payment-required"; paymentRequiredHeader: string; error?: { code: string; message: string } }
  | { kind: "pending"; record: DurableRegistrationRecord }
  | {
    kind: "settled";
    record: DurableRegistrationRecord;
    paymentResponseHeader: string;
    replayed: boolean;
  };

export type WorkflowContext = {
  runtime: RegistrationPlanRuntime;
  signedQuoteValue: unknown;
  plan: RegistrationExecutionPlan;
  siteOrigin: string;
  nowSeconds: number;
  paymentSignatureHeader: string | null;
  paymentPayload?: PaymentPayload;
  leaseSeconds: number;
  deferExecution?: boolean;
};

export type DurableWorkflowResumeContext = {
  runtime: RegistrationPlanRuntime;
  paymentIdentifier: string;
  planId: `sha256:${string}`;
  siteOrigin: string;
  nowSeconds: number;
};

async function loadOrPersistChallenge(options: {
  runtime: RegistrationPlanRuntime;
  quoteId: `sha256:${string}`;
  planId: `sha256:${string}`;
  routeConfig: OfficialX402RouteConfig;
}) {
  const validate = (persisted: Awaited<ReturnType<typeof options.runtime.store.loadChallenge>>) => {
    try {
      if (
        !persisted
        || persisted.quoteId !== options.quoteId
        || persisted.planId !== options.planId
        || persisted.challengeHash !== officialX402ChallengeHash(persisted.challenge)
      ) {
        throw new X402RegistrationError(503, "PERSISTED_CHALLENGE_MISMATCH", "The durable challenge binding is invalid.");
      }
      assertOfficialX402ChallengeMatchesConfig(persisted.challenge, options.routeConfig);
      return persisted.challenge;
    } catch (error) {
      if (isX402RegistrationError(error)) throw error;
      throw new X402RegistrationError(503, "PERSISTED_CHALLENGE_MISMATCH", "The durable challenge binding is invalid.");
    }
  };

  const existing = await options.runtime.store.loadChallenge({
    quoteId: options.quoteId,
    planId: options.planId,
  });
  if (existing) return validate(existing);

  const challenge = await options.runtime.adapter.createChallenge(options.routeConfig);
  assertOfficialX402ChallengeMatchesConfig(challenge, options.routeConfig);
  const persisted = {
    quoteId: options.quoteId,
    planId: options.planId,
    challengeHash: officialX402ChallengeHash(challenge),
    challenge,
  };
  const result = await options.runtime.store.persistChallenge(persisted);
  if (result.outcome === "conflict") {
    throw new X402RegistrationError(409, "CHALLENGE_PERSISTENCE_CONFLICT", "Another challenge is already bound to this signed quote.");
  }
  return validate(result.persisted);
}

function settledResult(
  runtime: RegistrationPlanRuntime,
  record: DurableRegistrationRecord,
  replayed: boolean,
): RegistrationPlanWorkflowResult {
  if (!record.settlementResponse || !record.settlementTransaction || !record.revealTransaction) {
    throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The settled plan record is incomplete.");
  }
  return {
    kind: "settled",
    record,
    paymentResponseHeader: runtime.adapter.encodeSettlement(record.settlementResponse),
    replayed,
  };
}

function terminalError(record: DurableRegistrationRecord): never {
  throw new X402RegistrationError(
    409,
    "REGISTRATION_TERMINAL_FAILURE",
    "This commit/reveal payment attempt ended before settlement and cannot be replayed.",
    {
      quoteId: record.quoteId,
      planId: record.planId,
      paymentIdentifier: record.paymentIdentifier,
      refundDisposition: record.refundDisposition,
    },
  );
}

async function releaseBestEffort(
  runtime: RegistrationPlanRuntime,
  reservation: RegistrationReservation,
  lease: RegistrationLease,
) {
  try {
    await runtime.store.release({ reservation, lease });
  } catch {
    // Expiring fencing leases are the fail-safe when release is unavailable.
  }
}

async function terminalTransition(options: {
  runtime: RegistrationPlanRuntime;
  reservation: RegistrationReservation;
  lease: RegistrationLease;
  expectedStatuses: RegistrationJobStatus[];
  errorCode: string;
  commitTransaction?: Hash;
  revealTransaction?: Hash;
}) {
  const record = await options.runtime.store.transition({
    reservation: options.reservation,
    lease: options.lease,
    expectedStatuses: options.expectedStatuses,
    patch: {
      status: "terminal-failure",
      refundDisposition: "not-required-unsettled",
      errorCode: options.errorCode,
      ...(options.commitTransaction ? { commitTransaction: options.commitTransaction } : {}),
      ...(options.revealTransaction ? { revealTransaction: options.revealTransaction } : {}),
    },
  });
  await releaseBestEffort(options.runtime, options.reservation, options.lease);
  return record;
}

function validateSettlement(settlement: SettleResponse, challenge: OfficialX402Challenge) {
  return settlement.success === true
    && /^0x[a-fA-F0-9]{64}$/.test(settlement.transaction)
    && settlement.network === challenge.requirement.network
    && (settlement.amount === undefined || settlement.amount === challenge.requirement.amount);
}

async function settleConfirmed(options: {
  runtime: RegistrationPlanRuntime;
  reservation: RegistrationReservation;
  lease: RegistrationLease;
  record: DurableRegistrationRecord;
  payment: PaymentPayload;
  challenge: OfficialX402Challenge;
}) {
  if (!options.record.revealTransaction) {
    throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The confirmed reveal record is incomplete.");
  }
  const lease = await options.runtime.store.renew({
    reservation: options.reservation,
    lease: options.lease,
  });
  let settlement: SettleResponse;
  try {
    settlement = await options.runtime.adapter.settle(options.payment, options.challenge);
  } catch (error) {
    const record = await options.runtime.store.transition({
      reservation: options.reservation,
      lease,
      expectedStatuses: ["confirmed", "reconciliation-required"],
      patch: {
        status: "reconciliation-required",
        refundDisposition: "manual-review",
        errorCode: isX402RegistrationError(error) ? error.code : "PAYMENT_SETTLEMENT_UNAVAILABLE",
      },
    });
    await releaseBestEffort(options.runtime, options.reservation, lease);
    throw new X402RegistrationError(502, "REGISTRATION_RECONCILIATION_REQUIRED", "Reveal is confirmed, but payment settlement requires reconciliation.", {
      planId: record.planId,
      revealTransaction: record.revealTransaction,
      refundDisposition: record.refundDisposition,
    });
  }
  if (!validateSettlement(settlement, options.challenge)) {
    const record = await options.runtime.store.transition({
      reservation: options.reservation,
      lease,
      expectedStatuses: ["confirmed", "reconciliation-required"],
      patch: {
        status: "reconciliation-required",
        refundDisposition: "manual-review",
        errorCode: "PAYMENT_SETTLEMENT_FAILED",
      },
    });
    await releaseBestEffort(options.runtime, options.reservation, lease);
    throw new X402RegistrationError(502, "REGISTRATION_RECONCILIATION_REQUIRED", "Reveal is confirmed, but payment settlement requires reconciliation.", {
      planId: record.planId,
      revealTransaction: record.revealTransaction,
      refundDisposition: record.refundDisposition,
    });
  }
  const settled = await options.runtime.store.transition({
    reservation: options.reservation,
    lease,
    expectedStatuses: ["confirmed", "reconciliation-required"],
    patch: {
      status: "settled",
      refundDisposition: "not-applicable-registered",
      settlementTransaction: settlement.transaction as Hash,
      settlementResponse: settlement,
    },
  });
  await releaseBestEffort(options.runtime, options.reservation, lease);
  return settledResult(options.runtime, settled, options.record.status === "reconciliation-required");
}

export async function executeRegistrationPlanWorkflow(
  context: WorkflowContext,
): Promise<RegistrationPlanWorkflowResult> {
  assertRegistrationPlanRuntime(context.runtime);
  const { intent } = parseAndValidateV3RegistrationQuote(context.signedQuoteValue, {
    authenticator: context.runtime.quoteAuthenticator,
    nowSeconds: context.nowSeconds,
    expectedChainId: context.plan.chainId,
  });
  assertRegistrationPlanRuntime(context.runtime, {
    keeperAddress: context.runtime.signer.address,
    payTo: intent.payTo,
  });
  await context.runtime.planAdapter.validateBundle({ intent, plan: context.plan });
  await assertExecutionPlanCalldataRecomputed({
    plan: context.plan,
    decodeAndRecomputeCalldata: (plan) => context.runtime.planAdapter.decodeAndRecomputeCalldata(plan),
  });
  if (
    context.plan.quoteId !== intent.quoteId
    || context.plan.planId !== intent.planId
    || context.plan.chainId !== intent.chainId
    || context.plan.network !== intent.network
    || !intent.normalizationTypedDataDigest
    || intent.normalizationTypedDataDigest.toLowerCase()
      !== context.plan.normalizationAttestation.typedDataDigest.toLowerCase()
    || !intent.controllerAttestationHash
    || intent.controllerAttestationHash.toLowerCase()
      !== context.plan.normalizationAttestation.controllerAttestationHash.toLowerCase()
    || intent.normalizationValidUntil
      !== context.plan.normalizationAttestation.claims.validUntil
  ) {
    throw new X402RegistrationError(503, "EXECUTION_PLAN_INTENT_MISMATCH", "The V3 execution plan does not match its payment intent.");
  }
  const routeConfig = buildOfficialX402RouteConfig({
    intent,
    siteOrigin: context.siteOrigin,
    nowSeconds: context.nowSeconds,
  });
  const challenge = await loadOrPersistChallenge({
    runtime: context.runtime,
    quoteId: intent.quoteId,
    planId: context.plan.planId,
    routeConfig,
  });
  if (!context.paymentSignatureHeader && !context.paymentPayload) {
    return { kind: "payment-required", paymentRequiredHeader: challenge.paymentRequiredHeader };
  }

  const payment = context.paymentPayload
    ?? context.runtime.adapter.decodePayment(context.paymentSignatureHeader!);
  const { paymentIdentifier } = context.runtime.adapter.matchPayment(payment, challenge);
  try {
    await context.runtime.adapter.verify(payment, challenge);
  } catch (error) {
    if (isX402RegistrationError(error) && error.status === 402) {
      return {
        kind: "payment-required",
        paymentRequiredHeader: challenge.paymentRequiredHeader,
        error: { code: error.code, message: error.message },
      };
    }
    throw error;
  }

  const requestFingerprint = registrationRequestFingerprint({
    intent,
    plan: context.plan,
  });
  const reservation: RegistrationReservation = {
    paymentIdentifier,
    requestFingerprint,
    paymentPayloadHash: paymentPayloadHash(payment),
    paymentAuthorizationHash: paymentAuthorizationHash(payment),
    planId: context.plan.planId,
    quoteId: intent.quoteId,
    paymentPayload: payment,
    signedQuote: context.signedQuoteValue,
    executionPlan: context.plan,
    leaseSeconds: context.leaseSeconds,
  };
  const result = await context.runtime.store.reserveOrAcquire(reservation);
  if (result.outcome === "conflict") {
    throw new X402RegistrationError(409, "PAYMENT_REPLAY_CONFLICT", "The payment identifier or underlying authorization is bound to another plan.");
  }
  if (result.outcome === "existing") {
    if (result.record.status === "settled") return settledResult(context.runtime, result.record, true);
    if (result.record.status === "terminal-failure") terminalError(result.record);
    return { kind: "pending", record: result.record };
  }

  let { record, lease } = result;
  if (record.status === "settled") {
    await releaseBestEffort(context.runtime, reservation, lease);
    return settledResult(context.runtime, record, true);
  }
  if (record.status === "terminal-failure") terminalError(record);
  if (record.status === "confirmed" || record.status === "reconciliation-required") {
    return settleConfirmed({ runtime: context.runtime, reservation, lease, record, payment, challenge });
  }
  if (record.status === "reserved") {
    record = await context.runtime.store.transition({
      reservation,
      lease,
      expectedStatuses: ["reserved"],
      patch: { status: "verified", refundDisposition: "not-required-unsettled" },
    });
  }

  if (context.deferExecution && record.status === "verified") {
    await releaseBestEffort(context.runtime, reservation, lease);
    return { kind: "pending", record };
  }

  if (record.status === "verified") {
    lease = await context.runtime.store.renew({ reservation, lease });
    const commitTransaction = await context.runtime.signer.broadcastStep({
      plan: context.plan,
      step: "commit",
      paymentIdentifier,
      requestFingerprint,
      fencingToken: lease.fencingToken,
    });
    record = await context.runtime.store.transition({
      reservation,
      lease,
      expectedStatuses: ["verified"],
      patch: {
        status: "commit-submitted",
        commitTransaction,
        refundDisposition: "not-required-unsettled",
      },
    });
  }

  if (record.status === "commit-submitted") {
    if (!record.commitTransaction) {
      throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The commit record is incomplete.");
    }
    const commit = await context.runtime.reconciler.reconcileStep({
      plan: context.plan,
      step: "commit",
      transactionHash: record.commitTransaction,
      expectedSigner: context.runtime.signer.address,
    });
    if (commit === "pending") {
      await releaseBestEffort(context.runtime, reservation, lease);
      return { kind: "pending", record };
    }
    if (commit === "reverted" || commit === "mismatch") {
      terminalError(await terminalTransition({
        runtime: context.runtime,
        reservation,
        lease,
        expectedStatuses: ["commit-submitted"],
        errorCode: commit === "reverted" ? "COMMIT_TRANSACTION_REVERTED" : "COMMIT_TRANSACTION_MISMATCH",
        commitTransaction: record.commitTransaction,
      }));
    }
    const readiness = await context.runtime.reconciler.revealReadiness({
      plan: context.plan,
      commitTransaction: record.commitTransaction,
    });
    if (readiness === "waiting") {
      await releaseBestEffort(context.runtime, reservation, lease);
      return { kind: "pending", record };
    }
    if (readiness === "expired") {
      terminalError(await terminalTransition({
        runtime: context.runtime,
        reservation,
        lease,
        expectedStatuses: ["commit-submitted"],
        errorCode: "REVEAL_WINDOW_EXPIRED",
        commitTransaction: record.commitTransaction,
      }));
    }
    record = await context.runtime.store.transition({
      reservation,
      lease,
      expectedStatuses: ["commit-submitted"],
      patch: { status: "reveal-ready" },
    });
  }

  if (record.status === "reveal-ready") {
    lease = await context.runtime.store.renew({ reservation, lease });
    const revealTransaction = await context.runtime.signer.broadcastStep({
      plan: context.plan,
      step: "reveal",
      paymentIdentifier,
      requestFingerprint,
      fencingToken: lease.fencingToken,
    });
    record = await context.runtime.store.transition({
      reservation,
      lease,
      expectedStatuses: ["reveal-ready"],
      patch: {
        status: "reveal-submitted",
        revealTransaction,
        refundDisposition: "not-required-unsettled",
      },
    });
  }

  if (record.status !== "reveal-submitted" || !record.revealTransaction) {
    throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The reveal record is inconsistent.");
  }
  const reveal = await context.runtime.reconciler.reconcileStep({
    plan: context.plan,
    step: "reveal",
    transactionHash: record.revealTransaction,
    expectedSigner: context.runtime.signer.address,
  });
  if (reveal === "pending") {
    await releaseBestEffort(context.runtime, reservation, lease);
    return { kind: "pending", record };
  }
  if (reveal === "reverted" || reveal === "mismatch") {
    terminalError(await terminalTransition({
      runtime: context.runtime,
      reservation,
      lease,
      expectedStatuses: ["reveal-submitted"],
      errorCode: reveal === "reverted" ? "REVEAL_TRANSACTION_REVERTED" : "REVEAL_TRANSACTION_MISMATCH",
      ...(record.commitTransaction ? { commitTransaction: record.commitTransaction } : {}),
      revealTransaction: record.revealTransaction,
    }));
  }
  record = await context.runtime.store.transition({
    reservation,
    lease,
    expectedStatuses: ["reveal-submitted"],
    patch: {
      status: "confirmed",
      revealTransaction: record.revealTransaction,
      refundDisposition: "not-applicable-registered",
    },
  });
  return settleConfirmed({ runtime: context.runtime, reservation, lease, record, payment, challenge });
}

export async function resumeRegistrationPlanWorkflow(
  context: DurableWorkflowResumeContext,
): Promise<RegistrationPlanWorkflowResult> {
  assertRegistrationPlanRuntime(context.runtime);
  const reservation = await context.runtime.store.loadReservation({
    paymentIdentifier: context.paymentIdentifier,
    planId: context.planId,
  });
  if (!reservation) {
    throw new X402RegistrationError(404, "REGISTRATION_ORDER_NOT_FOUND", "The durable registration order was not found.");
  }
  if (
    reservation.paymentIdentifier !== context.paymentIdentifier
    || reservation.planId !== context.planId
    || reservation.executionPlan.planId !== context.planId
  ) {
    throw new X402RegistrationError(503, "DURABLE_STORE_PROTOCOL_ERROR", "The durable registration order has inconsistent bindings.");
  }
  return executeRegistrationPlanWorkflow({
    runtime: context.runtime,
    signedQuoteValue: reservation.signedQuote,
    plan: reservation.executionPlan,
    siteOrigin: context.siteOrigin,
    nowSeconds: context.nowSeconds,
    paymentSignatureHeader: null,
    paymentPayload: reservation.paymentPayload,
    leaseSeconds: reservation.leaseSeconds,
  });
}
