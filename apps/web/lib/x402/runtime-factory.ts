import { createPublicClient, getAddress, http } from "viem";
import { configuredChain } from "@/lib/chain";
import { v3Manifest } from "@/lib/v3-api";
import {
  COMPILED_X402_RUNTIME_CAPABILITIES,
  keeperSpendingLimits,
  lockLeaseSeconds,
  operationTimeoutMs,
  x402RegistrationReadiness,
} from "./config";
import { v3X402DeploymentProfile } from "./deployment-profile";
import { X402RegistrationError } from "./errors";
import {
  ExternalDurableIdempotencyStore,
  ExternalManagedPlanSigner,
  ExternalNormalizationAttestationIssuer,
} from "./external-runtime";
import { createOfficialX402V2Adapter } from "./official-adapter";
import { quoteAuthenticatorFromEnvironment } from "./quote-auth";
import type { RegistrationPlanRuntime } from "./registration";
import {
  V3RegistrationExecutionPlanAdapter,
  V3RegistrationPlanReconciler,
  v3RegistrationExecutionPolicy,
} from "./v3-runtime";

type Environment = Record<string, string | undefined>;

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new X402RegistrationError(503, "X402_RUNTIME_NOT_READY", "A required paid-registration runtime binding is unavailable.");
  }
  return value;
}

export type V3PaidRegistrationRuntime = {
  runtime: RegistrationPlanRuntime;
  attestationIssuer: ExternalNormalizationAttestationIssuer;
  siteOrigin: string;
  leaseSeconds: number;
  readiness: ReturnType<typeof x402RegistrationReadiness>;
};

export function createV3PaidRegistrationRuntime(
  environment: Environment = process.env,
): V3PaidRegistrationRuntime {
  const profile = v3X402DeploymentProfile(v3Manifest);
  const readiness = x402RegistrationReadiness(
    profile,
    environment,
    COMPILED_X402_RUNTIME_CAPABILITIES,
  );
  if (!readiness.ready) {
    throw new X402RegistrationError(
      503,
      readiness.blockers[0]?.code ?? "X402_RUNTIME_NOT_READY",
      "The paid V3 registration runtime is not operationally ready.",
    );
  }
  const controller = v3Manifest.contracts.controller.address;
  const registry = v3Manifest.contracts.registry.address;
  const keeper = environment.X402_KEEPER_ADDRESS?.trim();
  if (!controller || !registry || !keeper) {
    throw new X402RegistrationError(503, "V3_DEPLOYMENT_BINDING_MISSING", "The paid V3 deployment bindings are incomplete.");
  }
  const timeoutMs = operationTimeoutMs(environment);
  const leaseSeconds = lockLeaseSeconds(environment);
  const limits = keeperSpendingLimits(environment);
  const rpcUrl = required(environment, "RPC_URL");
  const siteOrigin = new URL(required(environment, "X402_SITE_ORIGIN")).origin;
  const publicClient = createPublicClient({
    chain: configuredChain,
    transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 0 }),
  });
  const policy = v3RegistrationExecutionPolicy(v3Manifest);
  const planAdapter = new V3RegistrationExecutionPlanAdapter({
    manifest: v3Manifest,
    publicClient,
    payer: getAddress(keeper),
    policy,
    maxOrderBaseUnits: limits.maxOrderBaseUnits,
  });
  const signer = new ExternalManagedPlanSigner({
    url: required(environment, "X402_KEEPER_SIGNER_URL"),
    authToken: required(environment, "X402_KEEPER_SIGNER_AUTH_TOKEN"),
    timeoutMs,
    address: getAddress(keeper),
    provider: required(environment, "X402_KEEPER_SIGNER_PROVIDER").toLowerCase(),
    limits: {
      settlementAsset: getAddress(v3Manifest.settlement.tokenAddress!),
      controller: getAddress(controller),
      ...limits,
    },
    policy,
    decodeAndRecomputeCalldata: (plan) => planAdapter.decodeAndRecomputeCalldata(plan),
  });
  const runtime: RegistrationPlanRuntime = {
    adapter: createOfficialX402V2Adapter({
      facilitatorUrl: required(environment, "X402_FACILITATOR_URL"),
      ...(environment.X402_FACILITATOR_AUTH_TOKEN?.trim()
        ? { facilitatorAuthToken: environment.X402_FACILITATOR_AUTH_TOKEN.trim() }
        : {}),
      network: `eip155:${v3Manifest.chainId}`,
      timeoutMs,
    }),
    store: new ExternalDurableIdempotencyStore({
      url: required(environment, "X402_IDEMPOTENCY_STORE_URL"),
      authToken: required(environment, "X402_IDEMPOTENCY_STORE_AUTH_TOKEN"),
      timeoutMs,
    }),
    signer,
    reconciler: new V3RegistrationPlanReconciler({ manifest: v3Manifest, publicClient }),
    planAdapter,
    quoteAuthenticator: quoteAuthenticatorFromEnvironment(environment),
  };
  return {
    runtime,
    attestationIssuer: new ExternalNormalizationAttestationIssuer({
      url: required(environment, "X402_NORMALIZATION_ATTESTATION_URL"),
      authToken: required(environment, "X402_NORMALIZATION_ATTESTATION_AUTH_TOKEN"),
      timeoutMs,
      profileReference: required(environment, "X402_NORMALIZATION_PROFILE_REFERENCE"),
      policy,
    }),
    siteOrigin,
    leaseSeconds,
    readiness,
  };
}
