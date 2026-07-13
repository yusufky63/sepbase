import { describe, expect, it } from "vitest";
import {
  publicX402RegistrationReadiness,
  quoteTtlSeconds,
  x402RegistrationReadiness,
} from "./config";
import type { X402DeploymentProfile } from "./deployment-profile";
import { legacyV2X402 } from "./legacy-v2-adapter";

const legacyProfile = legacyV2X402.profile;

describe("x402 registration readiness", () => {
  it("is disabled and fail-closed without operator and runtime capabilities", () => {
    const readiness = x402RegistrationReadiness(legacyProfile, {});
    expect(readiness.ready).toBe(false);
    expect(readiness.enabled).toBe(false);
    expect(readiness.implementationStatus).toBe("activation-gated");
    expect(readiness.paidExecutionImplemented).toBe(true);
    expect(readiness.reviewedTargetPackages).toEqual({
      "@x402/core": "2.18.0",
      "@x402/evm": "2.18.0",
      "@x402/extensions": "2.18.0",
      workflow: "4.6.0",
    });
    expect(readiness.capabilities.officialAdapterRuntime).toBe(false);
    expect(readiness.blockers.map((item) => item.code)).toContain("FEATURE_DISABLED");
    expect(readiness.blockers.map((item) => item.code)).toContain("SETTLEMENT_UNSUPPORTED");
    expect(readiness.blockers.map((item) => item.code)).toContain("V3_COMMIT_REVEAL_REQUIRED");
    expect(readiness.blockers.map((item) => item.code)).toContain("QUOTE_AUTHENTICATION_NOT_CONFIGURED");
    expect(JSON.stringify(readiness)).not.toContain("private");
  });

  it("rejects raw keeper keys and never reports their value", () => {
    const secret = `0x${"ab".repeat(32)}`;
    const readiness = x402RegistrationReadiness(legacyProfile, {
      X402_REGISTRATION_ENABLED: "true",
      X402_KEEPER_PRIVATE_KEY: secret,
    });
    expect(readiness.capabilities.rawPrivateKeyAbsent).toBe(false);
    expect(readiness.blockers.map((item) => item.code)).toContain("RAW_PRIVATE_KEY_FORBIDDEN");
    expect(JSON.stringify(readiness)).not.toContain(secret);
  });

  it("bounds the optional quote lifetime", () => {
    expect(quoteTtlSeconds({})).toBe(60);
    expect(quoteTtlSeconds({ X402_QUOTE_TTL_SECONDS: "30" })).toBe(30);
    expect(() => quoteTtlSeconds({ X402_QUOTE_TTL_SECONDS: "301" })).toThrow();
  });

  it("reports operational only when the live V3 profile and every external capability are configured", () => {
    const token = "0x3333333333333333333333333333333333333333";
    const keeper = "0x4444444444444444444444444444444444444444";
    const v3Profile: X402DeploymentProfile = {
      manifestGeneration: "v3",
      chainId: 84_532,
      contractVersion: "3.0.0",
      deploymentPublished: true,
      registrationMode: "commit-reveal",
      executionPlanAdapterReady: true,
      calldataAllowlist: {
        commit: { target: "0x1111111111111111111111111111111111111111", selector: "0xaaaaaaaa" },
        reveal: { target: "0x2222222222222222222222222222222222222222", selector: "0xbbbbbbbb" },
      },
      normalization: {
        attestor: "0x5555555555555555555555555555555555555555",
        controller: "0x2222222222222222222222222222222222222222",
        normalizationProfileHash: `0x${"66".repeat(32)}`,
      },
      settlement: {
        kind: "erc20",
        tokenAddress: token,
        decimals: 6,
      },
    };
    const readiness = x402RegistrationReadiness(v3Profile, {
      NODE_ENV: "production",
      RPC_URL: "https://rpc.example/base-sepolia/authenticated",
      X402_REGISTRATION_ENABLED: "true",
      X402_FACILITATOR_URL: "https://facilitator.example/v2",
      X402_PAYMENT_ASSET_ADDRESS: token,
      X402_PAY_TO_ADDRESS: keeper,
      X402_KEEPER_ADDRESS: keeper,
      X402_KEEPER_SIGNER_PROVIDER: "external",
      X402_KEEPER_SIGNER_URL: "https://signer.example/v1/transactions",
      X402_KEEPER_SIGNER_AUTH_TOKEN: "s".repeat(32),
      X402_KEEPER_MAX_ORDER_BASE_UNITS: "1000000",
      X402_KEEPER_DAILY_LIMIT_BASE_UNITS: "10000000",
      X402_IDEMPOTENCY_STORE_URL: "https://store.example/v1/registrations",
      X402_IDEMPOTENCY_STORE_AUTH_TOKEN: "d".repeat(32),
      X402_SITE_ORIGIN: "https://names.example",
      X402_QUOTE_HMAC_KEY_ID: "production-2026-07",
      X402_QUOTE_HMAC_KEY: Buffer.alloc(32, 12).toString("base64url"),
      X402_QUOTE_TTL_SECONDS: "300",
      X402_NORMALIZATION_ATTESTATION_URL: "https://attestor.example/v1/normalize",
      X402_NORMALIZATION_ATTESTATION_AUTH_TOKEN: "a".repeat(32),
      X402_NORMALIZATION_PROFILE_REFERENCE: "base-v3-2026-07",
      X402_WORKFLOW_ENABLED: "true",
      X402_WORKFLOW_BILLING_CONFIRMED: "true",
      X402_WORKFLOW_FLUID_COMPUTE_CONFIRMED: "true",
      X402_ABUSE_PROTECTION_CONFIRMED: "true",
      X402_MONITORING_CONFIRMED: "true",
      X402_RECONCILIATION_RUNBOOK_CONFIRMED: "true",
      X402_INDEPENDENT_REVIEW_CONFIRMED: "true",
    }, {
      officialAdapter: true,
      keeperSigner: true,
      durableIdempotencyStore: true,
      durableWorkflow: true,
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.network).toBe("eip155:84532");
    expect(readiness.blockers).toEqual([]);
    expect(readiness.implementationStatus).toBe("operational");
    const environment = {
      NODE_ENV: "production",
      RPC_URL: "https://rpc.example/base-sepolia/authenticated",
      X402_REGISTRATION_ENABLED: "true",
      X402_FACILITATOR_URL: "https://facilitator.example/v2",
      X402_PAYMENT_ASSET_ADDRESS: token,
      X402_PAY_TO_ADDRESS: keeper,
      X402_KEEPER_ADDRESS: keeper,
      X402_KEEPER_SIGNER_PROVIDER: "external",
      X402_KEEPER_SIGNER_URL: "https://signer.example/v1/transactions",
      X402_KEEPER_SIGNER_AUTH_TOKEN: "s".repeat(32),
      X402_KEEPER_MAX_ORDER_BASE_UNITS: "1000000",
      X402_KEEPER_DAILY_LIMIT_BASE_UNITS: "10000000",
      X402_IDEMPOTENCY_STORE_URL: "https://store.example/v1/registrations",
      X402_IDEMPOTENCY_STORE_AUTH_TOKEN: "d".repeat(32),
      X402_SITE_ORIGIN: "https://names.example",
      X402_QUOTE_HMAC_KEY_ID: "production-2026-07",
      X402_QUOTE_HMAC_KEY: Buffer.alloc(32, 12).toString("base64url"),
      X402_QUOTE_TTL_SECONDS: "300",
      X402_NORMALIZATION_ATTESTATION_URL: "https://attestor.example/v1/normalize",
      X402_NORMALIZATION_ATTESTATION_AUTH_TOKEN: "a".repeat(32),
      X402_NORMALIZATION_PROFILE_REFERENCE: "base-v3-2026-07",
      X402_WORKFLOW_ENABLED: "true",
      X402_WORKFLOW_BILLING_CONFIRMED: "true",
      X402_WORKFLOW_FLUID_COMPUTE_CONFIRMED: "true",
      X402_ABUSE_PROTECTION_CONFIRMED: "true",
      X402_MONITORING_CONFIRMED: "true",
      X402_RECONCILIATION_RUNBOOK_CONFIRMED: "true",
      X402_INDEPENDENT_REVIEW_CONFIRMED: "true",
    };
    const publicReadiness = publicX402RegistrationReadiness(v3Profile, environment, {
      officialAdapter: true,
      keeperSigner: true,
      durableIdempotencyStore: true,
      durableWorkflow: true,
    });
    expect(publicReadiness).toEqual({
      available: true,
      implementationStatus: "operational",
      paidExecutionImplemented: true,
      protocolVersion: 2,
      network: "eip155:84532",
    });
    expect(JSON.stringify(publicReadiness)).not.toMatch(/capabilities|blockers|configured|secret|environment/i);
  });
});
