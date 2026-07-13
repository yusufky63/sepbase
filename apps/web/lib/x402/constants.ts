export const X402_PROTOCOL_VERSION = 2 as const;
export const X402_EXACT_SCHEME = "exact" as const;
export const X402_IMPLEMENTATION_STATUS = "activation-gated" as const;
export const X402_PAID_EXECUTION_IMPLEMENTED = true as const;
export const X402_REQUIRED_SETTLEMENT_DECIMALS = 6 as const;

export const X402_REGISTRATION_PATH = "/api/x402/registration" as const;
export const X402_REGISTRATION_QUOTE_PATH = "/api/x402/registration/quote" as const;
export const X402_REGISTRATION_STATUS_PATH = "/api/x402/registration/status" as const;

export const REGISTRATION_QUOTE_SCHEMA = "sepbase.x402.registration-quote.v1" as const;
export const V3_REGISTRATION_QUOTE_SCHEMA = "sepbase.x402.v3-registration-quote.v1" as const;
export const NORMALIZATION_ATTESTATION_DOMAIN_NAME = "ChainNameControllerV3" as const;
export const NORMALIZATION_ATTESTATION_DOMAIN_VERSION = "3" as const;

export const DEFAULT_QUOTE_TTL_SECONDS = 60;
export const MIN_QUOTE_TTL_SECONDS = 15;
export const MAX_QUOTE_TTL_SECONDS = 300;
export const MIN_PAID_QUOTE_TTL_SECONDS = 120;
export const MAX_REGISTRATION_BODY_BYTES = 64 * 1024;
export const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
export const MIN_OPERATION_TIMEOUT_MS = 5_000;
export const MAX_OPERATION_TIMEOUT_MS = 120_000;
export const DEFAULT_LOCK_LEASE_SECONDS = 300;
export const MIN_LOCK_LEASE_SECONDS = 60;
export const MAX_LOCK_LEASE_SECONDS = 900;

export const PAYMENT_IDENTIFIER_MIN_LENGTH = 16;
export const PAYMENT_IDENTIFIER_MAX_LENGTH = 128;
export const PAYMENT_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

// Exact versions reviewed against the official x402 V2 documentation and runtime API.
export const REVIEWED_X402_TARGET_PACKAGES = Object.freeze({
  "@x402/core": "2.18.0",
  "@x402/evm": "2.18.0",
  "@x402/extensions": "2.18.0",
  workflow: "4.6.0",
});
