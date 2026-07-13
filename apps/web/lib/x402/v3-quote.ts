import { createHash } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import {
  MAX_QUOTE_TTL_SECONDS,
  V3_REGISTRATION_QUOTE_SCHEMA,
  X402_REGISTRATION_PATH,
} from "./constants";
import { X402RegistrationError } from "./errors";
import type { RegistrationQuoteAuthenticator } from "./quote-auth";
import type {
  SignedV3RegistrationQuote,
  X402RegistrationPaymentIntent,
} from "./types";

const canonicalAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).refine((value) => {
  try {
    return getAddress(value) === value;
  } catch {
    return false;
  }
}, "Address must use its canonical checksum representation.");
const uintSchema = z.string().regex(/^(0|[1-9]\d*)$/);
const positiveUintSchema = z.string().regex(/^[1-9]\d*$/);
const bytes32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const signedQuoteSchema = z.object({
  schema: z.literal(V3_REGISTRATION_QUOTE_SCHEMA),
  quoteId: sha256Schema,
  planId: sha256Schema,
  authentication: z.object({
    algorithm: z.literal("hmac-sha256"),
    keyId: z.string().min(1).max(64),
    signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  }).strict(),
  chainId: z.number().int().positive(),
  network: z.string().regex(/^eip155:[1-9]\d*$/),
  resourcePath: z.literal(X402_REGISTRATION_PATH),
  description: z.string().min(1).max(256),
  asset: canonicalAddressSchema,
  amountBaseUnits: positiveUintSchema,
  payTo: canonicalAddressSchema,
  issuedAt: uintSchema,
  expiresAt: positiveUintSchema,
  paymentTimeoutSeconds: z.number().int().positive().max(MAX_QUOTE_TTL_SECONDS),
  normalizationTypedDataDigest: bytes32Schema,
  controllerAttestationHash: bytes32Schema,
  normalizationValidUntil: positiveUintSchema,
}).strict();

export type UnsignedV3RegistrationQuote = Omit<
  SignedV3RegistrationQuote,
  "planId" | "authentication"
>;

function quoteIdentityPayload(value: Omit<UnsignedV3RegistrationQuote, "quoteId">) {
  return JSON.stringify([
    value.schema,
    value.chainId,
    value.network,
    value.resourcePath,
    value.description,
    value.asset.toLowerCase(),
    value.amountBaseUnits,
    value.payTo.toLowerCase(),
    value.issuedAt,
    value.expiresAt,
    value.paymentTimeoutSeconds,
    value.normalizationTypedDataDigest.toLowerCase(),
    value.controllerAttestationHash.toLowerCase(),
    value.normalizationValidUntil,
  ]);
}

export function v3RegistrationQuoteId(
  value: Omit<UnsignedV3RegistrationQuote, "quoteId">,
) {
  return `sha256:${createHash("sha256").update(quoteIdentityPayload(value)).digest("hex")}` as const;
}

export function createUnsignedV3RegistrationQuote(options: {
  chainId: number;
  description: string;
  asset: Address;
  amountBaseUnits: string;
  payTo: Address;
  issuedAt: string;
  expiresAt: string;
  paymentTimeoutSeconds: number;
  normalizationTypedDataDigest: Hex;
  controllerAttestationHash: Hex;
  normalizationValidUntil: string;
}): UnsignedV3RegistrationQuote {
  const withoutId = {
    schema: V3_REGISTRATION_QUOTE_SCHEMA,
    chainId: options.chainId,
    network: `eip155:${options.chainId}` as const,
    resourcePath: X402_REGISTRATION_PATH,
    description: options.description,
    asset: getAddress(options.asset),
    amountBaseUnits: options.amountBaseUnits,
    payTo: getAddress(options.payTo),
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt,
    paymentTimeoutSeconds: options.paymentTimeoutSeconds,
    normalizationTypedDataDigest: options.normalizationTypedDataDigest,
    controllerAttestationHash: options.controllerAttestationHash,
    normalizationValidUntil: options.normalizationValidUntil,
  };
  return { ...withoutId, quoteId: v3RegistrationQuoteId(withoutId) };
}

function signingPayload(
  quote: Omit<SignedV3RegistrationQuote, "authentication">,
) {
  // quoteId identifies immutable payment/attestation terms. planId is added
  // afterward because the plan itself contains quoteId; the HMAC still binds
  // both identifiers and prevents either side of that relationship changing.
  const { planId, ...identity } = quote;
  const { quoteId, ...withoutId } = identity;
  return `${quoteId}\n${planId}\n${quoteIdentityPayload(withoutId)}`;
}

export function signV3RegistrationQuote(options: {
  quote: UnsignedV3RegistrationQuote;
  planId: `sha256:${string}`;
  authenticator: RegistrationQuoteAuthenticator;
}): SignedV3RegistrationQuote {
  const unsigned = { ...options.quote, planId: options.planId };
  return {
    ...unsigned,
    authentication: options.authenticator.sign(signingPayload(unsigned)),
  };
}

export function parseAndValidateV3RegistrationQuote(
  value: unknown,
  options: {
    authenticator: RegistrationQuoteAuthenticator;
    nowSeconds: number;
    expectedChainId: number;
  },
): { quote: SignedV3RegistrationQuote; intent: X402RegistrationPaymentIntent } {
  const parsed = signedQuoteSchema.safeParse(value);
  if (!parsed.success) {
    throw new X402RegistrationError(400, "INVALID_V3_QUOTE", "The signed V3 registration quote has an invalid schema.");
  }
  const quote = parsed.data as SignedV3RegistrationQuote;
  const { authentication, planId, quoteId, ...withoutBindings } = quote;
  if (
    quoteId !== v3RegistrationQuoteId(withoutBindings)
    || !options.authenticator.verify(signingPayload({ ...withoutBindings, quoteId, planId }), authentication)
  ) {
    throw new X402RegistrationError(400, "V3_QUOTE_AUTHENTICATION_FAILED", "The V3 registration quote failed integrity authentication.");
  }
  if (
    quote.chainId !== options.expectedChainId
    || quote.network !== `eip155:${options.expectedChainId}`
  ) {
    throw new X402RegistrationError(409, "V3_QUOTE_SCOPE_MISMATCH", "The V3 quote belongs to another chain.");
  }
  const issuedAt = Number(quote.issuedAt);
  const expiresAt = Number(quote.expiresAt);
  const validUntil = BigInt(quote.normalizationValidUntil);
  if (
    !Number.isSafeInteger(issuedAt)
    || !Number.isSafeInteger(expiresAt)
    || issuedAt > options.nowSeconds + 5
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > MAX_QUOTE_TTL_SECONDS
    || quote.paymentTimeoutSeconds > expiresAt - issuedAt
    || validUntil < BigInt(expiresAt)
  ) {
    throw new X402RegistrationError(400, "INVALID_V3_QUOTE_WINDOW", "The V3 quote validity bounds are invalid.");
  }
  if (expiresAt <= options.nowSeconds) {
    throw new X402RegistrationError(409, "V3_QUOTE_EXPIRED", "The V3 registration quote has expired.");
  }
  return {
    quote,
    intent: {
      quoteId,
      planId,
      chainId: quote.chainId,
      network: quote.network,
      resourcePath: quote.resourcePath,
      description: quote.description,
      asset: getAddress(quote.asset),
      amountBaseUnits: quote.amountBaseUnits,
      payTo: getAddress(quote.payTo),
      issuedAt: quote.issuedAt,
      expiresAt: quote.expiresAt,
      paymentTimeoutSeconds: quote.paymentTimeoutSeconds,
      normalizationTypedDataDigest: quote.normalizationTypedDataDigest,
      controllerAttestationHash: quote.controllerAttestationHash,
      normalizationValidUntil: quote.normalizationValidUntil,
    },
  };
}
