import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import {
  DEFAULT_QUOTE_TTL_SECONDS,
  DEFAULT_LOCK_LEASE_SECONDS,
  DEFAULT_OPERATION_TIMEOUT_MS,
  MAX_QUOTE_TTL_SECONDS,
  MAX_LOCK_LEASE_SECONDS,
  MAX_OPERATION_TIMEOUT_MS,
  MIN_PAID_QUOTE_TTL_SECONDS,
  MIN_QUOTE_TTL_SECONDS,
  MIN_LOCK_LEASE_SECONDS,
  MIN_OPERATION_TIMEOUT_MS,
  REVIEWED_X402_TARGET_PACKAGES,
  X402_EXACT_SCHEME,
  X402_IMPLEMENTATION_STATUS,
  X402_PAID_EXECUTION_IMPLEMENTED,
  X402_PROTOCOL_VERSION,
  X402_REQUIRED_SETTLEMENT_DECIMALS,
  X402_REGISTRATION_PATH,
  X402_REGISTRATION_QUOTE_PATH,
} from "./constants";
import { X402RegistrationError } from "./errors";
import { quoteAuthenticationConfigured } from "./quote-auth";
import type { X402DeploymentProfile } from "./deployment-profile";

type Environment = Record<string, string | undefined>;

export type X402RuntimeCapabilities = {
  officialAdapter: boolean;
  keeperSigner: boolean;
  durableIdempotencyStore: boolean;
  durableWorkflow: boolean;
};

export const COMPILED_X402_RUNTIME_CAPABILITIES: X402RuntimeCapabilities = Object.freeze({
  officialAdapter: true,
  keeperSigner: true,
  durableIdempotencyStore: true,
  durableWorkflow: true,
});

export type X402RegistrationReadiness = {
  enabled: boolean;
  ready: boolean;
  implementationStatus: typeof X402_IMPLEMENTATION_STATUS | "operational";
  paidExecutionImplemented: boolean;
  protocolVersion: 2;
  scheme: "exact";
  network: `eip155:${number}`;
  paths: {
    quote: typeof X402_REGISTRATION_QUOTE_PATH;
    registration: typeof X402_REGISTRATION_PATH;
  };
  capabilities: {
    deploymentPublished: boolean;
    commitRevealDeployment: boolean;
    executionPlanAdapterReady: boolean;
    calldataPolicyPublished: boolean;
    normalizationPolicyPublished: boolean;
    featureFlag: boolean;
    erc20Settlement: boolean;
    sixDecimalSettlement: boolean;
    facilitatorConfigured: boolean;
    serverRpcConfigured: boolean;
    quoteAuthenticationConfigured: boolean;
    attestationIssuerConfigured: boolean;
    attestationIssuerAuthenticationConfigured: boolean;
    normalizationProfileReferenceConfigured: boolean;
    paidQuoteLifetimeSufficient: boolean;
    paymentAssetMatchesSettlement: boolean;
    paymentReceiverMatchesKeeper: boolean;
    keeperAddressConfigured: boolean;
    keeperSignerProviderConfigured: boolean;
    keeperSignerEndpointConfigured: boolean;
    keeperSignerAuthenticationConfigured: boolean;
    keeperOrderLimitConfigured: boolean;
    keeperDailyLimitConfigured: boolean;
    durableStoreEndpointConfigured: boolean;
    durableStoreAuthenticationConfigured: boolean;
    workflowFeatureConfigured: boolean;
    workflowBillingApproved: boolean;
    fluidComputeConfirmed: boolean;
    abuseProtectionConfirmed: boolean;
    monitoringConfirmed: boolean;
    reconciliationRunbookConfirmed: boolean;
    independentReviewConfirmed: boolean;
    siteOriginConfigured: boolean;
    officialAdapterRuntime: boolean;
    keeperSignerRuntime: boolean;
    durableStoreRuntime: boolean;
    durableWorkflowRuntime: boolean;
    rawPrivateKeyAbsent: boolean;
  };
  blockers: Array<{ code: string; message: string }>;
  reviewedTargetPackages: typeof REVIEWED_X402_TARGET_PACKAGES;
};

export type PublicX402RegistrationReadiness = {
  available: boolean;
  implementationStatus: typeof X402_IMPLEMENTATION_STATUS | "operational";
  paidExecutionImplemented: boolean;
  protocolVersion: 2;
  network: `eip155:${number}`;
};

export const allowedSignerProviders = new Set([
  "aws-kms",
  "gcp-kms",
  "azure-key-vault",
  "turnkey",
  "external",
]);

function configuredAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  if (!trimmed || !isAddress(trimmed)) return null;
  const address = getAddress(trimmed);
  return address === zeroAddress ? null : address;
}

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function isSecureServiceUrl(value: string | undefined, production: boolean) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    return url.protocol === "https:" || (!production && url.protocol === "http:" && isLoopback(url.hostname));
  } catch {
    return false;
  }
}

export function isConfiguredSecret(value: string | undefined) {
  const length = value?.trim().length ?? 0;
  return length >= 24 && length <= 4_096;
}

export function siteOriginConfigured(value: string | undefined, production: boolean) {
  if (!isSecureServiceUrl(value, production)) return false;
  const url = new URL(value!);
  return url.pathname === "/" && !url.search && !url.hash;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  code: string,
) {
  if (!raw?.trim()) return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    throw new X402RegistrationError(503, code, "The x402 runtime is misconfigured.");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new X402RegistrationError(503, code, "The x402 runtime is misconfigured.");
  }
  return value;
}

export function operationTimeoutMs(environment: Environment = process.env) {
  return boundedInteger(
    environment.X402_OPERATION_TIMEOUT_MS,
    DEFAULT_OPERATION_TIMEOUT_MS,
    MIN_OPERATION_TIMEOUT_MS,
    MAX_OPERATION_TIMEOUT_MS,
    "INVALID_OPERATION_TIMEOUT",
  );
}

export function lockLeaseSeconds(environment: Environment = process.env) {
  return boundedInteger(
    environment.X402_LOCK_LEASE_SECONDS,
    DEFAULT_LOCK_LEASE_SECONDS,
    MIN_LOCK_LEASE_SECONDS,
    MAX_LOCK_LEASE_SECONDS,
    "INVALID_LOCK_LEASE",
  );
}

export function quoteTtlSeconds(environment: Environment = process.env) {
  const raw = environment.X402_QUOTE_TTL_SECONDS?.trim();
  if (!raw) return DEFAULT_QUOTE_TTL_SECONDS;
  if (!/^\d+$/.test(raw)) {
    throw new X402RegistrationError(503, "INVALID_QUOTE_CONFIGURATION", "The quote lifetime is misconfigured.");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)
    || value < MIN_QUOTE_TTL_SECONDS
    || value > MAX_QUOTE_TTL_SECONDS) {
    throw new X402RegistrationError(503, "INVALID_QUOTE_CONFIGURATION", "The quote lifetime is misconfigured.");
  }
  return value;
}

export function optionalKeeperAddress(environment: Environment = process.env) {
  return configuredAddress(environment.X402_KEEPER_ADDRESS);
}

function configuredPositiveUint(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  try {
    const parsed = BigInt(trimmed);
    return parsed <= (1n << 256n) - 1n ? parsed : null;
  } catch {
    return null;
  }
}

export function keeperSpendingLimits(environment: Environment = process.env) {
  const maxOrderBaseUnits = configuredPositiveUint(environment.X402_KEEPER_MAX_ORDER_BASE_UNITS);
  const dailyLimitBaseUnits = configuredPositiveUint(environment.X402_KEEPER_DAILY_LIMIT_BASE_UNITS);
  if (!maxOrderBaseUnits || !dailyLimitBaseUnits || dailyLimitBaseUnits < maxOrderBaseUnits) {
    throw new X402RegistrationError(503, "KEEPER_LIMITS_NOT_CONFIGURED", "The managed keeper spending limits are invalid.");
  }
  return { maxOrderBaseUnits, dailyLimitBaseUnits };
}

export function x402RegistrationReadiness(
  profile: X402DeploymentProfile,
  environment: Environment = process.env,
  runtime: X402RuntimeCapabilities = {
    officialAdapter: false,
    keeperSigner: false,
    durableIdempotencyStore: false,
    durableWorkflow: false,
  },
): X402RegistrationReadiness {
  const production = environment.NODE_ENV === "production";
  const featureFlag = environment.X402_REGISTRATION_ENABLED?.trim() === "true";
  const keeperAddress = configuredAddress(environment.X402_KEEPER_ADDRESS);
  const payTo = configuredAddress(environment.X402_PAY_TO_ADDRESS);
  const paymentAsset = configuredAddress(environment.X402_PAYMENT_ASSET_ADDRESS);
  const settlementToken = profile.settlement.tokenAddress
    ? configuredAddress(profile.settlement.tokenAddress)
    : null;
  const signerProvider = environment.X402_KEEPER_SIGNER_PROVIDER?.trim().toLowerCase() ?? "";
  const erc20Settlement = profile.settlement.kind === "erc20" && settlementToken !== null;
  const validAllowlist = profile.calldataAllowlist !== null
    && configuredAddress(profile.calldataAllowlist.commit.target) !== null
    && /^0x[a-fA-F0-9]{8}$/.test(profile.calldataAllowlist.commit.selector)
    && configuredAddress(profile.calldataAllowlist.reveal.target) !== null
    && /^0x[a-fA-F0-9]{8}$/.test(profile.calldataAllowlist.reveal.selector);
  const validNormalization = profile.normalization !== null
    && configuredAddress(profile.normalization.attestor) !== null
    && configuredAddress(profile.normalization.controller) !== null
    && /^0x[a-fA-F0-9]{64}$/.test(profile.normalization.normalizationProfileHash);
  const configuredQuoteTtl = /^\d+$/.test(environment.X402_QUOTE_TTL_SECONDS?.trim() ?? "")
    ? Number(environment.X402_QUOTE_TTL_SECONDS)
    : DEFAULT_QUOTE_TTL_SECONDS;
  const configuredTimeout = /^\d+$/.test(environment.X402_OPERATION_TIMEOUT_MS?.trim() ?? "")
    ? Number(environment.X402_OPERATION_TIMEOUT_MS)
    : DEFAULT_OPERATION_TIMEOUT_MS;
  const maxOrderBaseUnits = configuredPositiveUint(environment.X402_KEEPER_MAX_ORDER_BASE_UNITS);
  const dailyLimitBaseUnits = configuredPositiveUint(environment.X402_KEEPER_DAILY_LIMIT_BASE_UNITS);

  const capabilities = {
    deploymentPublished: profile.deploymentPublished,
    commitRevealDeployment: profile.registrationMode === "commit-reveal",
    executionPlanAdapterReady: profile.executionPlanAdapterReady,
    calldataPolicyPublished: validAllowlist,
    normalizationPolicyPublished: validNormalization,
    featureFlag,
    erc20Settlement,
    sixDecimalSettlement: erc20Settlement
      && profile.settlement.decimals === X402_REQUIRED_SETTLEMENT_DECIMALS,
    facilitatorConfigured: isSecureServiceUrl(environment.X402_FACILITATOR_URL?.trim(), production),
    serverRpcConfigured: isSecureServiceUrl(environment.RPC_URL?.trim(), production),
    quoteAuthenticationConfigured: quoteAuthenticationConfigured(environment),
    attestationIssuerConfigured: isSecureServiceUrl(
      environment.X402_NORMALIZATION_ATTESTATION_URL?.trim(),
      production,
    ),
    attestationIssuerAuthenticationConfigured: isConfiguredSecret(
      environment.X402_NORMALIZATION_ATTESTATION_AUTH_TOKEN,
    ),
    normalizationProfileReferenceConfigured: /^[A-Za-z0-9._-]{1,64}$/.test(
      environment.X402_NORMALIZATION_PROFILE_REFERENCE?.trim() ?? "",
    ),
    paidQuoteLifetimeSufficient: Number.isSafeInteger(configuredQuoteTtl)
      && Number.isSafeInteger(configuredTimeout)
      && configuredQuoteTtl <= MAX_QUOTE_TTL_SECONDS
      && configuredTimeout >= MIN_OPERATION_TIMEOUT_MS
      && configuredTimeout <= MAX_OPERATION_TIMEOUT_MS
      && configuredQuoteTtl >= Math.max(
        MIN_PAID_QUOTE_TTL_SECONDS,
        Math.ceil(configuredTimeout / 1_000) + 60,
      ),
    paymentAssetMatchesSettlement: paymentAsset !== null
      && settlementToken !== null
      && paymentAsset.toLowerCase() === settlementToken.toLowerCase(),
    paymentReceiverMatchesKeeper: payTo !== null
      && keeperAddress !== null
      && payTo.toLowerCase() === keeperAddress.toLowerCase(),
    keeperAddressConfigured: keeperAddress !== null,
    keeperSignerProviderConfigured: allowedSignerProviders.has(signerProvider),
    keeperSignerEndpointConfigured: isSecureServiceUrl(
      environment.X402_KEEPER_SIGNER_URL?.trim(),
      production,
    ),
    keeperSignerAuthenticationConfigured: isConfiguredSecret(
      environment.X402_KEEPER_SIGNER_AUTH_TOKEN,
    ),
    keeperOrderLimitConfigured: maxOrderBaseUnits !== null,
    keeperDailyLimitConfigured: dailyLimitBaseUnits !== null
      && maxOrderBaseUnits !== null
      && dailyLimitBaseUnits >= maxOrderBaseUnits,
    durableStoreEndpointConfigured: isSecureServiceUrl(
      environment.X402_IDEMPOTENCY_STORE_URL?.trim(),
      production,
    ),
    durableStoreAuthenticationConfigured: isConfiguredSecret(
      environment.X402_IDEMPOTENCY_STORE_AUTH_TOKEN,
    ),
    workflowFeatureConfigured: environment.X402_WORKFLOW_ENABLED?.trim() === "true",
    workflowBillingApproved: environment.X402_WORKFLOW_BILLING_CONFIRMED?.trim() === "true",
    fluidComputeConfirmed: environment.X402_WORKFLOW_FLUID_COMPUTE_CONFIRMED?.trim() === "true",
    abuseProtectionConfirmed: environment.X402_ABUSE_PROTECTION_CONFIRMED?.trim() === "true",
    monitoringConfirmed: environment.X402_MONITORING_CONFIRMED?.trim() === "true",
    reconciliationRunbookConfirmed: environment.X402_RECONCILIATION_RUNBOOK_CONFIRMED?.trim() === "true",
    independentReviewConfirmed: environment.X402_INDEPENDENT_REVIEW_CONFIRMED?.trim() === "true",
    siteOriginConfigured: siteOriginConfigured(environment.X402_SITE_ORIGIN?.trim(), production),
    officialAdapterRuntime: runtime.officialAdapter,
    keeperSignerRuntime: runtime.keeperSigner,
    durableStoreRuntime: runtime.durableIdempotencyStore,
    durableWorkflowRuntime: runtime.durableWorkflow,
    rawPrivateKeyAbsent: !environment.X402_KEEPER_PRIVATE_KEY?.trim(),
  };

  const blockers: Array<{ code: string; message: string }> = [];
  const block = (condition: boolean, code: string, message: string) => {
    if (!condition) blockers.push({ code, message });
  };
  block(capabilities.featureFlag, "FEATURE_DISABLED", "Registration service is disabled by default.");
  block(
    X402_PAID_EXECUTION_IMPLEMENTED,
    "PAID_EXECUTION_NOT_IMPLEMENTED",
    "This build does not contain the reviewed V3 paid-execution adapter.",
  );
  block(capabilities.deploymentPublished, "NOT_DEPLOYED", "A published protocol deployment is required.");
  block(
    capabilities.commitRevealDeployment,
    "V3_COMMIT_REVEAL_REQUIRED",
    "Paid execution requires the V3 commit/reveal deployment profile.",
  );
  block(
    capabilities.executionPlanAdapterReady,
    "V3_EXECUTION_PLAN_ADAPTER_REQUIRED",
    "The V3 manifest and ABI must be bound to the execution-plan policy.",
  );
  block(
    capabilities.calldataPolicyPublished,
    "V3_CALLDATA_POLICY_REQUIRED",
    "The V3 manifest must publish commit and reveal target/selector allowlists.",
  );
  block(
    capabilities.normalizationPolicyPublished,
    "V3_NORMALIZATION_POLICY_REQUIRED",
    "The V3 manifest must publish its immutable normalization attestor, controller, and profile hash.",
  );
  block(
    capabilities.erc20Settlement,
    "SETTLEMENT_UNSUPPORTED",
    "The safe x402 keeper flow requires ERC-20 settlement; native conversion is not inferred.",
  );
  block(
    capabilities.sixDecimalSettlement,
    "SETTLEMENT_DECIMALS_UNSUPPORTED",
    "Paid x402 registration requires the matching six-decimal settlement asset.",
  );
  block(capabilities.facilitatorConfigured, "FACILITATOR_NOT_CONFIGURED", "A secure facilitator endpoint is required.");
  block(capabilities.serverRpcConfigured, "SERVER_RPC_NOT_CONFIGURED", "A server-only authenticated RPC endpoint is required.");
  block(
    capabilities.quoteAuthenticationConfigured,
    "QUOTE_AUTHENTICATION_NOT_CONFIGURED",
    "A server-only quote authentication key is required.",
  );
  block(
    capabilities.attestationIssuerConfigured,
    "ATTESTATION_ISSUER_NOT_CONFIGURED",
    "A separate secure normalization attestation issuer is required.",
  );
  block(
    capabilities.attestationIssuerAuthenticationConfigured,
    "ATTESTATION_ISSUER_AUTH_NOT_CONFIGURED",
    "Normalization attestation issuer authentication is required.",
  );
  block(
    capabilities.normalizationProfileReferenceConfigured,
    "NORMALIZATION_PROFILE_REFERENCE_NOT_CONFIGURED",
    "The managed issuer normalization profile reference is required.",
  );
  block(
    capabilities.paidQuoteLifetimeSufficient,
    "PAID_QUOTE_LIFETIME_INSUFFICIENT",
    "The paid quote lifetime must cover registration confirmation and settlement recovery.",
  );
  block(
    capabilities.paymentAssetMatchesSettlement,
    "PAYMENT_ASSET_MISMATCH",
    "The x402 payment asset must exactly match the deployment settlement token.",
  );
  block(capabilities.keeperAddressConfigured, "KEEPER_ADDRESS_NOT_CONFIGURED", "A keeper address is required.");
  block(
    capabilities.paymentReceiverMatchesKeeper,
    "PAYMENT_RECEIVER_MISMATCH",
    "The x402 receiver must be the keeper that funds registration.",
  );
  block(
    capabilities.keeperSignerProviderConfigured,
    "KEEPER_SIGNER_PROVIDER_NOT_CONFIGURED",
    "A managed or external keeper signer provider is required.",
  );
  block(
    capabilities.keeperSignerEndpointConfigured,
    "KEEPER_SIGNER_ENDPOINT_NOT_CONFIGURED",
    "A secure managed signer endpoint is required.",
  );
  block(
    capabilities.keeperSignerAuthenticationConfigured,
    "KEEPER_SIGNER_AUTH_NOT_CONFIGURED",
    "Managed signer authentication is required.",
  );
  block(
    capabilities.keeperOrderLimitConfigured && capabilities.keeperDailyLimitConfigured,
    "KEEPER_LIMITS_NOT_CONFIGURED",
    "Bounded per-order and daily managed-keeper limits are required.",
  );
  block(
    capabilities.durableStoreEndpointConfigured,
    "DURABLE_STORE_NOT_CONFIGURED",
    "A durable idempotency store endpoint is required.",
  );
  block(
    capabilities.durableStoreAuthenticationConfigured,
    "DURABLE_STORE_AUTH_NOT_CONFIGURED",
    "Durable store authentication is required.",
  );
  block(
    capabilities.workflowFeatureConfigured,
    "DURABLE_WORKFLOW_NOT_CONFIGURED",
    "The V3 commit/reveal Workflow DevKit runtime must be explicitly enabled.",
  );
  block(
    capabilities.workflowBillingApproved,
    "WORKFLOW_BILLING_NOT_APPROVED",
    "Workflow steps and managed persistence require an explicit operational billing approval.",
  );
  block(
    capabilities.fluidComputeConfirmed,
    "FLUID_COMPUTE_NOT_CONFIRMED",
    "Fluid Compute must be confirmed before long-running registration workflows are enabled.",
  );
  block(capabilities.abuseProtectionConfirmed, "ABUSE_PROTECTION_NOT_CONFIRMED", "Paid registration abuse protection must be operationally confirmed.");
  block(capabilities.monitoringConfirmed, "MONITORING_NOT_CONFIRMED", "Facilitator, workflow, signer, store and chain monitoring must be operationally confirmed.");
  block(capabilities.reconciliationRunbookConfirmed, "RECONCILIATION_RUNBOOK_NOT_CONFIRMED", "The paid-order reconciliation and incident runbook must be approved.");
  block(capabilities.independentReviewConfirmed, "INDEPENDENT_REVIEW_NOT_CONFIRMED", "Independent paid-runtime security review must be approved.");
  block(capabilities.siteOriginConfigured, "SITE_ORIGIN_NOT_CONFIGURED", "A canonical site origin is required.");
  block(
    capabilities.rawPrivateKeyAbsent,
    "RAW_PRIVATE_KEY_FORBIDDEN",
    "Raw keeper private keys are not accepted by this service configuration.",
  );
  block(
    capabilities.officialAdapterRuntime,
    "OFFICIAL_ADAPTER_UNAVAILABLE",
    "The official x402 V2 adapter has not been installed and initialized.",
  );
  block(
    capabilities.keeperSignerRuntime,
    "KEEPER_SIGNER_UNAVAILABLE",
    "The configured keeper signer is not available at runtime.",
  );
  block(
    capabilities.durableStoreRuntime,
    "DURABLE_STORE_UNAVAILABLE",
    "The durable idempotency store is not available at runtime.",
  );
  block(
    capabilities.durableWorkflowRuntime,
    "DURABLE_WORKFLOW_UNAVAILABLE",
    "The Workflow DevKit runtime is unavailable.",
  );

  return {
    enabled: featureFlag,
    ready: blockers.length === 0,
    implementationStatus: blockers.length === 0 ? "operational" : X402_IMPLEMENTATION_STATUS,
    paidExecutionImplemented: X402_PAID_EXECUTION_IMPLEMENTED,
    protocolVersion: X402_PROTOCOL_VERSION,
    scheme: X402_EXACT_SCHEME,
    network: `eip155:${profile.chainId}`,
    paths: {
      quote: X402_REGISTRATION_QUOTE_PATH,
      registration: X402_REGISTRATION_PATH,
    },
    capabilities,
    blockers,
    reviewedTargetPackages: REVIEWED_X402_TARGET_PACKAGES,
  };
}

export function publicX402RegistrationReadiness(
  profile: X402DeploymentProfile,
  environment: Environment = process.env,
  runtime: X402RuntimeCapabilities = COMPILED_X402_RUNTIME_CAPABILITIES,
): PublicX402RegistrationReadiness {
  const readiness = x402RegistrationReadiness(profile, environment, runtime);
  return {
    available: readiness.ready,
    implementationStatus: readiness.implementationStatus,
    paidExecutionImplemented: X402_PAID_EXECUTION_IMPLEMENTED,
    protocolVersion: X402_PROTOCOL_VERSION,
    network: `eip155:${profile.chainId}`,
  };
}
