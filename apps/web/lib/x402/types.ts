import type { Address, Hash, Hex } from "viem";
import type {
  NORMALIZATION_ATTESTATION_DOMAIN_NAME,
  NORMALIZATION_ATTESTATION_DOMAIN_VERSION,
  REGISTRATION_QUOTE_SCHEMA,
  V3_REGISTRATION_QUOTE_SCHEMA,
} from "./constants";

export type RegistrationQuote = {
  schema: typeof REGISTRATION_QUOTE_SCHEMA;
  quoteId: `sha256:${string}`;
  authentication: {
    algorithm: "hmac-sha256";
    keyId: string;
    signature: string;
  };
  scope: {
    chainId: number;
    network: `eip155:${number}`;
    contract: Address;
    contractVersion: string;
    suffix: string;
    resource: string;
  };
  request: {
    label: string;
    fullName: string;
    durationYears: number;
    recipient: Address;
    referrer: Address | null;
  };
  terms: {
    expectedAmountBaseUnits: string;
    expectedReferralRewardBps: number;
    settlement: {
      kind: "native" | "erc20";
      asset: Address | null;
      symbol: string;
      decimals: number;
    };
  };
  state: {
    tokenId: string;
    blockNumber: string;
    available: true;
    reserved: false;
    registrationsPaused: false;
    solvent: true;
  };
  issuedAt: string;
  expiresAt: string;
};

export type RegistrationQuoteInput = {
  label: string;
  durationYears: number;
  recipient: Address;
  referrer: Address | null;
};

export type X402RegistrationPaymentIntent = {
  quoteId: `sha256:${string}`;
  planId: `sha256:${string}` | null;
  chainId: number;
  network: `eip155:${number}`;
  resourcePath: string;
  description: string;
  asset: Address;
  amountBaseUnits: string;
  payTo: Address;
  issuedAt: string;
  expiresAt: string;
  paymentTimeoutSeconds: number;
  normalizationTypedDataDigest: Hex | null;
  controllerAttestationHash: Hex | null;
  normalizationValidUntil: string | null;
};

export type SignedV3RegistrationQuote = {
  schema: typeof V3_REGISTRATION_QUOTE_SCHEMA;
  quoteId: `sha256:${string}`;
  planId: `sha256:${string}`;
  authentication: RegistrationQuote["authentication"];
  chainId: number;
  network: `eip155:${number}`;
  resourcePath: string;
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
};

export type LiveRegistrationState = {
  tokenId: bigint;
  blockNumber: bigint;
  available: boolean;
  reserved: boolean;
  status: number;
  registrationsPaused: boolean;
  solvent: boolean;
  amount: bigint;
  referralRewardBps: number;
};

export type SettledX402Payment = {
  x402Version: 2;
  scheme: "exact";
  network: `eip155:${number}`;
  asset: Address;
  amountBaseUnits: string;
  payTo: Address;
  paymentIdentifier: string;
  settlementTransaction: Hash;
};

export type RegistrationExecutionStepKind = "commit" | "reveal";

export type RegistrationExecutionStep = {
  kind: RegistrationExecutionStepKind;
  target: Address;
  selector: Hex;
  calldata: Hex;
  valueBaseUnits: string;
};

export type NormalizationAttestation = {
  schema: "sepbase.normalization-attestation.v1";
  domain: {
    name: typeof NORMALIZATION_ATTESTATION_DOMAIN_NAME;
    version: typeof NORMALIZATION_ATTESTATION_DOMAIN_VERSION;
  };
  claims: {
    chainId: number;
    controller: Address;
    normalizationProfileHash: Hex;
    labelHash: Hex;
    recipient: Address;
    validUntil: string;
  };
  typedDataDigest: Hex;
  controllerAttestationHash: Hex;
  signature: Hex;
};

export type RegistrationExecutionPlan = {
  schema: "sepbase.x402.registration-plan.v1";
  planId: `sha256:${string}`;
  quoteId: RegistrationQuote["quoteId"];
  chainId: number;
  network: `eip155:${number}`;
  normalizationAttestation: NormalizationAttestation;
  steps: readonly [
    RegistrationExecutionStep & { kind: "commit" },
    RegistrationExecutionStep & { kind: "reveal" },
  ];
  revealWindow: {
    clock: "block" | "timestamp";
    minimumAge: string;
    maximumAge: string;
  };
};

export type RegistrationRefundDisposition =
  | "not-required-unsettled"
  | "not-applicable-registered"
  | "manual-review";
