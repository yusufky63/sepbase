import { z } from "zod";

export const CAS_SCHEMA = "sepbase.x402.idempotency.v1" as const;
export const CAS_CAPABILITIES = Object.freeze({
  durable: true as const,
  distributed: true as const,
  atomicCompareAndSet: true as const,
  encryptedAtRest: true as const,
  globalAuthorizationUniqueness: true as const,
  deterministicChallengePersistence: true as const,
  fencingLeases: true as const,
});

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const transactionHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const paymentIdentifier = z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);
const status = z.enum([
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
const refundDisposition = z.enum([
  "not-required-unsettled",
  "not-applicable-registered",
  "manual-review",
]);

export const reservationSchema = z.object({
  paymentIdentifier,
  requestFingerprint: sha256,
  paymentPayloadHash: sha256,
  paymentAuthorizationHash: sha256,
  planId: sha256,
  quoteId: sha256,
  paymentPayload: z.unknown(),
  signedQuote: z.unknown(),
  executionPlan: z.unknown(),
  leaseSeconds: z.number().int().min(60).max(900),
}).strict();

export const reservationBindingSchema = reservationSchema.omit({
  paymentPayload: true,
  signedQuote: true,
  executionPlan: true,
});

export const leaseSchema = z.object({
  token: z.string().min(16).max(512),
  fencingToken: z.string().min(1).max(128).regex(/^[1-9]\d*$/),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export const preparedPlanSchema = z.object({
  quoteId: sha256,
  planId: sha256,
  signedQuote: z.unknown(),
  executionPlan: z.unknown(),
  expiresAt: z.string().regex(/^[1-9]\d*$/),
}).strict();

export const persistedChallengeSchema = z.object({
  quoteId: sha256,
  planId: sha256,
  challengeHash: sha256,
  challenge: z.object({
    paymentRequired: z.unknown(),
    requirement: z.unknown(),
    paymentRequiredHeader: z.string().min(1).max(128 * 1024),
    declaredExtensions: z.record(z.string(), z.unknown()),
  }).strict(),
}).strict();

const settlementResponseSchema = z.object({
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

const patchSchema = z.object({
  status: status.optional(),
  refundDisposition: refundDisposition.optional(),
  commitTransaction: transactionHash.optional(),
  revealTransaction: transactionHash.optional(),
  settlementTransaction: transactionHash.optional(),
  settlementResponse: settlementResponseSchema.optional(),
  errorCode: z.string().min(1).max(96).regex(/^[A-Z0-9_]+$/).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "A transition patch is required.");

const schemaAndOperation = <T extends string>(operation: T) => ({
  schema: z.literal(CAS_SCHEMA),
  operation: z.literal(operation),
});

export const casRequestSchema = z.discriminatedUnion("operation", [
  z.object({
    ...schemaAndOperation("load-registration-plan"),
    paymentIdentifier,
    planId: sha256,
  }).strict(),
  z.object({
    ...schemaAndOperation("load-registration-record"),
    paymentIdentifier,
    planId: sha256,
  }).strict(),
  z.object({
    ...schemaAndOperation("load-prepared-registration-plan"),
    quoteId: sha256,
    planId: sha256,
  }).strict(),
  z.object({
    ...schemaAndOperation("persist-prepared-registration-plan"),
    prepared: preparedPlanSchema,
  }).strict(),
  z.object({
    ...schemaAndOperation("reserve-or-acquire-plan"),
    reservation: reservationSchema,
  }).strict(),
  z.object({
    ...schemaAndOperation("compare-and-set-plan"),
    reservation: reservationBindingSchema,
    lease: leaseSchema,
    expectedStatuses: z.array(status).min(1).max(status.options.length)
      .refine((items) => new Set(items).size === items.length, "Duplicate expected status."),
    patch: patchSchema,
  }).strict(),
  z.object({
    ...schemaAndOperation("renew-plan-lease"),
    reservation: reservationBindingSchema,
    lease: leaseSchema,
  }).strict(),
  z.object({
    ...schemaAndOperation("release-plan-lease"),
    reservation: reservationBindingSchema,
    lease: leaseSchema,
  }).strict(),
  z.object({
    ...schemaAndOperation("load-registration-challenge"),
    quoteId: sha256,
    planId: sha256,
  }).strict(),
  z.object({
    ...schemaAndOperation("persist-registration-challenge"),
    persisted: persistedChallengeSchema,
  }).strict(),
]);

export type CasRequest = z.infer<typeof casRequestSchema>;
