import { createHash } from "node:crypto";
import { getAddress, isAddress, keccak256, toBytes, zeroAddress, type Address } from "viem";
import { z } from "zod";
import { normalizeLabel } from "@/lib/name-normalization";
import {
  MAX_QUOTE_TTL_SECONDS,
  PAYMENT_IDENTIFIER_MAX_LENGTH,
  PAYMENT_IDENTIFIER_MIN_LENGTH,
  PAYMENT_IDENTIFIER_PATTERN,
  REGISTRATION_QUOTE_SCHEMA,
  X402_REGISTRATION_PATH,
} from "./constants";
import { X402RegistrationError } from "./errors";
import type { RegistrationQuoteAuthenticator } from "./quote-auth";
import type {
  LiveRegistrationState,
  RegistrationQuote,
  RegistrationQuoteInput,
} from "./types";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const canonicalUintPattern = /^(0|[1-9]\d*)$/;
const quoteIdPattern = /^sha256:[a-f0-9]{64}$/;
const quoteSignaturePattern = /^[A-Za-z0-9_-]{43}$/;
const canonicalAddressSchema = z.string()
  .regex(addressPattern)
  .refine((value) => {
    try {
      return getAddress(value) === value;
    } catch {
      return false;
    }
  });
const canonicalLabelSchema = z.string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9-]+$/)
  .refine((value) => !value.startsWith("-") && !value.endsWith("-") && !value.includes("--"));

const quoteSchema = z.object({
  schema: z.literal(REGISTRATION_QUOTE_SCHEMA),
  quoteId: z.string().regex(quoteIdPattern),
  authentication: z.object({
    algorithm: z.literal("hmac-sha256"),
    keyId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
    signature: z.string().regex(quoteSignaturePattern),
  }).strict(),
  scope: z.object({
    chainId: z.number().int().positive(),
    network: z.string().regex(/^eip155:[1-9]\d*$/),
    contract: canonicalAddressSchema,
    contractVersion: z.string().min(1).max(64),
    suffix: z.string().min(1).max(32),
    resource: z.literal(X402_REGISTRATION_PATH),
  }).strict(),
  request: z.object({
    label: canonicalLabelSchema,
    fullName: z.string().min(3).max(65),
    durationYears: z.number().int().min(1).max(5),
    recipient: canonicalAddressSchema,
    referrer: canonicalAddressSchema.nullable(),
  }).strict(),
  terms: z.object({
    expectedAmountBaseUnits: z.string().regex(/^[1-9]\d*$/),
    expectedReferralRewardBps: z.number().int().min(0).max(2_000),
    settlement: z.object({
      kind: z.enum(["native", "erc20"]),
      asset: canonicalAddressSchema.nullable(),
      symbol: z.string().min(1).max(64),
      decimals: z.number().int().min(0).max(36),
    }).strict(),
  }).strict(),
  state: z.object({
    tokenId: z.string().regex(canonicalUintPattern),
    blockNumber: z.string().regex(canonicalUintPattern),
    available: z.literal(true),
    reserved: z.literal(false),
    registrationsPaused: z.literal(false),
    solvent: z.literal(true),
  }).strict(),
  issuedAt: z.string().regex(canonicalUintPattern),
  expiresAt: z.string().regex(canonicalUintPattern),
}).strict();

export type RegistrationQuoteScope = {
  chainId: number;
  contract: Address;
  contractVersion: string;
  suffix: string;
  settlement: {
    kind: "native" | "erc20";
    tokenAddress: Address | null;
    symbol: string;
    decimals: number;
  };
};

function getSingleParameter(url: URL, name: string, required: boolean) {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) {
    throw new X402RegistrationError(400, "AMBIGUOUS_INPUT", `${name} must be provided at most once.`);
  }
  const value = values[0];
  if (required && !value) {
    throw new X402RegistrationError(400, "MISSING_INPUT", `${name} is required.`);
  }
  return value ?? null;
}

function canonicalAddress(value: string, field: string): Address {
  if (!isAddress(value)) {
    throw new X402RegistrationError(400, "INVALID_ADDRESS", `${field} must be a valid EVM address.`);
  }
  const address = getAddress(value);
  if (address === zeroAddress) {
    throw new X402RegistrationError(400, "INVALID_ADDRESS", `${field} cannot be the zero address.`);
  }
  return address;
}

export function parseRegistrationQuoteRequest(
  requestUrl: string,
  options: {
    suffix: string;
    allowedYears: readonly number[];
    contract: Address;
    keeperAddress?: Address | null;
  },
): RegistrationQuoteInput {
  const url = new URL(requestUrl);
  const allowedParameters = new Set(["label", "durationYears", "recipient", "referrer"]);
  for (const key of url.searchParams.keys()) {
    if (!allowedParameters.has(key)) {
      throw new X402RegistrationError(400, "UNKNOWN_INPUT", `Unsupported query parameter: ${key}.`);
    }
  }

  const rawLabel = getSingleParameter(url, "label", true) ?? "";
  const normalized = normalizeLabel(rawLabel, options.suffix);
  if (!normalized.valid) {
    throw new X402RegistrationError(400, "INVALID_LABEL", normalized.reason ?? "Invalid label.");
  }
  if (rawLabel !== normalized.label) {
    throw new X402RegistrationError(
      400,
      "NON_CANONICAL_LABEL",
      "Use the canonical lowercase label without a suffix.",
      { normalizedSuggestion: normalized.label },
    );
  }

  const durationRaw = getSingleParameter(url, "durationYears", true) ?? "";
  if (!/^[1-9]\d*$/.test(durationRaw)) {
    throw new X402RegistrationError(400, "INVALID_DURATION", "durationYears must be an allowed integer.");
  }
  const durationYears = Number(durationRaw);
  if (!options.allowedYears.includes(durationYears)) {
    throw new X402RegistrationError(400, "INVALID_DURATION", "durationYears is not supported by this deployment.");
  }

  const recipient = canonicalAddress(
    getSingleParameter(url, "recipient", true) ?? "",
    "recipient",
  );
  if (recipient.toLowerCase() === options.contract.toLowerCase()) {
    throw new X402RegistrationError(400, "INVALID_RECIPIENT", "recipient cannot be the protocol contract.");
  }

  const rawReferrer = getSingleParameter(url, "referrer", false);
  const referrer = rawReferrer ? canonicalAddress(rawReferrer, "referrer") : null;
  if (referrer?.toLowerCase() === recipient.toLowerCase()) {
    throw new X402RegistrationError(400, "INVALID_REFERRER", "referrer cannot equal recipient.");
  }
  if (referrer && options.keeperAddress
    && referrer.toLowerCase() === options.keeperAddress.toLowerCase()) {
    throw new X402RegistrationError(400, "INVALID_REFERRER", "referrer cannot equal the configured keeper payer.");
  }

  return { label: normalized.label, durationYears, recipient, referrer };
}

type UnsignedRegistrationQuote = Omit<RegistrationQuote, "quoteId" | "authentication">;

function quoteFingerprintPayload(quote: UnsignedRegistrationQuote) {
  return JSON.stringify([
    quote.schema,
    quote.scope.chainId,
    quote.scope.network,
    quote.scope.contract.toLowerCase(),
    quote.scope.contractVersion,
    quote.scope.suffix,
    quote.scope.resource,
    quote.request.label,
    quote.request.fullName,
    quote.request.durationYears,
    quote.request.recipient.toLowerCase(),
    quote.request.referrer?.toLowerCase() ?? null,
    quote.terms.expectedAmountBaseUnits,
    quote.terms.expectedReferralRewardBps,
    quote.terms.settlement.kind,
    quote.terms.settlement.asset?.toLowerCase() ?? null,
    quote.terms.settlement.symbol,
    quote.terms.settlement.decimals,
    quote.state.tokenId,
    quote.state.blockNumber,
    quote.state.available,
    quote.state.reserved,
    quote.state.registrationsPaused,
    quote.state.solvent,
    quote.issuedAt,
    quote.expiresAt,
  ]);
}

export function registrationQuoteId(quote: UnsignedRegistrationQuote) {
  return `sha256:${createHash("sha256").update(quoteFingerprintPayload(quote)).digest("hex")}` as const;
}

export function registrationQuoteSigningPayload(
  quote: UnsignedRegistrationQuote,
  quoteId: RegistrationQuote["quoteId"],
) {
  return `${quoteId}\n${quoteFingerprintPayload(quote)}`;
}

export function buildRegistrationQuote(options: {
  input: RegistrationQuoteInput;
  live: LiveRegistrationState;
  scope: RegistrationQuoteScope;
  nowSeconds: number;
  ttlSeconds: number;
  authenticator: RegistrationQuoteAuthenticator;
}): RegistrationQuote {
  const { input, live, scope } = options;
  if (live.reserved) {
    throw new X402RegistrationError(409, "NAME_RESERVED", "This label is reserved and cannot be registered.");
  }
  if (!live.available) {
    throw new X402RegistrationError(409, "NAME_NOT_AVAILABLE", "This label is already registered or in its grace period.", {
      statusCode: live.status,
    });
  }
  if (live.registrationsPaused) {
    throw new X402RegistrationError(503, "REGISTRATIONS_PAUSED", "New registrations are currently paused.");
  }
  if (!live.solvent) {
    throw new X402RegistrationError(503, "PROTOCOL_INSOLVENT", "The protocol is not accepting economic operations.");
  }
  if (live.amount <= 0n) {
    throw new X402RegistrationError(503, "INVALID_ONCHAIN_QUOTE", "The contract returned an invalid registration amount.");
  }
  if (!Number.isInteger(options.nowSeconds) || options.nowSeconds < 0) {
    throw new X402RegistrationError(500, "INVALID_SERVER_TIME", "The server clock is invalid.");
  }
  if (!Number.isInteger(options.ttlSeconds)
    || options.ttlSeconds < 1
    || options.ttlSeconds > MAX_QUOTE_TTL_SECONDS) {
    throw new X402RegistrationError(503, "INVALID_QUOTE_CONFIGURATION", "The quote lifetime configuration is invalid.");
  }

  const unsigned: UnsignedRegistrationQuote = {
    schema: REGISTRATION_QUOTE_SCHEMA,
    scope: {
      chainId: scope.chainId,
      network: `eip155:${scope.chainId}`,
      contract: getAddress(scope.contract),
      contractVersion: scope.contractVersion,
      suffix: scope.suffix,
      resource: X402_REGISTRATION_PATH,
    },
    request: {
      label: input.label,
      fullName: `${input.label}.${scope.suffix}`,
      durationYears: input.durationYears,
      recipient: getAddress(input.recipient),
      referrer: input.referrer ? getAddress(input.referrer) : null,
    },
    terms: {
      expectedAmountBaseUnits: live.amount.toString(),
      expectedReferralRewardBps: input.referrer ? live.referralRewardBps : 0,
      settlement: {
        kind: scope.settlement.kind,
        asset: scope.settlement.tokenAddress ? getAddress(scope.settlement.tokenAddress) : null,
        symbol: scope.settlement.symbol,
        decimals: scope.settlement.decimals,
      },
    },
    state: {
      tokenId: live.tokenId.toString(),
      blockNumber: live.blockNumber.toString(),
      available: true,
      reserved: false,
      registrationsPaused: false,
      solvent: true,
    },
    issuedAt: options.nowSeconds.toString(),
    expiresAt: (options.nowSeconds + options.ttlSeconds).toString(),
  };

  const quoteId = registrationQuoteId(unsigned);
  return {
    ...unsigned,
    quoteId,
    authentication: options.authenticator.sign(registrationQuoteSigningPayload(unsigned, quoteId)),
  };
}

export function parseAndValidateRegistrationQuote(
  value: unknown,
  options: {
    scope: RegistrationQuoteScope;
    nowSeconds: number;
    maxTtlSeconds: number;
    authenticator: RegistrationQuoteAuthenticator;
    keeperAddress?: Address | null;
  },
): RegistrationQuote {
  const parsed = quoteSchema.safeParse(value);
  if (!parsed.success) {
    throw new X402RegistrationError(400, "INVALID_QUOTE", "The registration quote has an invalid schema.");
  }
  const quote = parsed.data as RegistrationQuote;
  const { scope } = options;
  if (
    quote.scope.chainId !== scope.chainId
    || quote.scope.network !== `eip155:${scope.chainId}`
    || quote.scope.contract.toLowerCase() !== scope.contract.toLowerCase()
    || quote.scope.contractVersion !== scope.contractVersion
    || quote.scope.suffix !== scope.suffix
  ) {
    throw new X402RegistrationError(409, "QUOTE_SCOPE_MISMATCH", "The quote belongs to another deployment.");
  }
  if (
    quote.terms.settlement.kind !== scope.settlement.kind
    || quote.terms.settlement.asset?.toLowerCase()
      !== scope.settlement.tokenAddress?.toLowerCase()
    || quote.terms.settlement.symbol !== scope.settlement.symbol
    || quote.terms.settlement.decimals !== scope.settlement.decimals
  ) {
    throw new X402RegistrationError(409, "QUOTE_ASSET_MISMATCH", "The quote settlement asset no longer matches this deployment.");
  }
  if (quote.request.fullName !== `${quote.request.label}.${scope.suffix}`
    || quote.state.tokenId !== BigInt(keccak256(toBytes(quote.request.label))).toString()) {
    throw new X402RegistrationError(400, "INVALID_QUOTE", "The quote name identity is inconsistent.");
  }
  if (quote.request.referrer === null && quote.terms.expectedReferralRewardBps !== 0) {
    throw new X402RegistrationError(400, "INVALID_QUOTE", "A quote without a referrer must use zero expected reward BPS.");
  }
  if (quote.request.recipient.toLowerCase() === scope.contract.toLowerCase()) {
    throw new X402RegistrationError(400, "INVALID_RECIPIENT", "recipient cannot be the protocol contract.");
  }
  if (quote.request.referrer?.toLowerCase() === quote.request.recipient.toLowerCase()) {
    throw new X402RegistrationError(400, "INVALID_REFERRER", "referrer cannot equal recipient.");
  }
  if (options.keeperAddress
    && quote.request.referrer?.toLowerCase() === options.keeperAddress.toLowerCase()) {
    throw new X402RegistrationError(400, "INVALID_REFERRER", "referrer cannot equal the configured keeper payer.");
  }
  const { quoteId, authentication, ...unsigned } = quote;
  if (registrationQuoteId(unsigned) !== quoteId) {
    throw new X402RegistrationError(400, "QUOTE_INTEGRITY_FAILED", "The quote contents do not match its identifier.");
  }
  if (!options.authenticator.verify(
    registrationQuoteSigningPayload(unsigned, quoteId),
    authentication,
  )) {
    throw new X402RegistrationError(400, "QUOTE_AUTHENTICATION_FAILED", "The quote was not authenticated by this server.");
  }

  const issuedAt = Number(quote.issuedAt);
  const expiresAt = Number(quote.expiresAt);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) {
    throw new X402RegistrationError(400, "INVALID_QUOTE", "The quote time bounds are invalid.");
  }
  if (issuedAt > options.nowSeconds + 5 || expiresAt <= issuedAt
    || expiresAt - issuedAt > options.maxTtlSeconds) {
    throw new X402RegistrationError(400, "INVALID_QUOTE_WINDOW", "The quote validity window is invalid.");
  }
  if (expiresAt <= options.nowSeconds) {
    throw new X402RegistrationError(409, "QUOTE_EXPIRED", "The registration quote has expired.");
  }
  return quote;
}

export function isValidPaymentIdentifier(value: string) {
  return value.length >= PAYMENT_IDENTIFIER_MIN_LENGTH
    && value.length <= PAYMENT_IDENTIFIER_MAX_LENGTH
    && PAYMENT_IDENTIFIER_PATTERN.test(value);
}
