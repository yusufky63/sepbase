import {
  chainNameControllerV3Abi,
  type V3SuiteManifest,
} from "@sepbase/sdk";
import type { DeploymentManifest } from "../deployment-manifest.schema";
import { encodeFunctionData, getAddress, type Address } from "viem";
import type { RegistrationQuote, X402RegistrationPaymentIntent } from "./types";

/**
 * Narrow adapter boundary between versioned deployment manifests and x402.
 * V3 can provide a new mapper without leaking its multi-contract schema into
 * the protocol, CAS, facilitator, or signer infrastructure.
 */
export type X402DeploymentProfile = {
  manifestGeneration: "v2-legacy" | "v3";
  chainId: number;
  contractVersion: string;
  deploymentPublished: boolean;
  registrationMode: "legacy-direct" | "commit-reveal";
  executionPlanAdapterReady: boolean;
  calldataAllowlist: {
    commit: { target: string; selector: string };
    reveal: { target: string; selector: string };
  } | null;
  normalization: {
    attestor: string;
    controller: string;
    normalizationProfileHash: string;
  } | null;
  settlement: {
    kind: "native" | "erc20";
    tokenAddress: string | null;
    decimals: number;
  };
};

export function legacyV2X402DeploymentProfile(
  manifest: DeploymentManifest,
): X402DeploymentProfile {
  return {
    manifestGeneration: "v2-legacy",
    chainId: manifest.chainId,
    contractVersion: manifest.contractVersion,
    deploymentPublished: manifest.contract !== null,
    registrationMode: "legacy-direct",
    executionPlanAdapterReady: false,
    calldataAllowlist: null,
    normalization: null,
    settlement: {
      kind: manifest.settlement.kind,
      tokenAddress: manifest.settlement.tokenAddress,
      decimals: manifest.settlement.decimals,
    },
  };
}

export function v3X402DeploymentProfile(manifest: V3SuiteManifest): X402DeploymentProfile {
  const controller = manifest.contracts.controller.address;
  const registry = manifest.contracts.registry.address;
  const attestor = manifest.normalization.attestor;
  const allContractsPublished = Object.values(manifest.contracts).every(
    (module) => module.address !== null && module.runtimeCodeHash !== null,
  );
  const paidReleasePublished = manifest.releaseStatus === "live"
    && manifest.wiring.suiteConfigured
    && allContractsPublished
    && manifest.capabilities.paidX402
    && manifest.x402.paidExecutionAvailable;
  const commitSelector = encodeFunctionData({
    abi: chainNameControllerV3Abi,
    functionName: "commit",
    args: [`0x${"00".repeat(32)}`],
  }).slice(0, 10);
  const registerSelector = controller
    ? encodeFunctionData({
      abi: chainNameControllerV3Abi,
      functionName: "register",
      args: [{
        label: "a",
        recipient: getAddress("0x0000000000000000000000000000000000000001"),
        durationYears: 1,
        referrer: getAddress("0x0000000000000000000000000000000000000000"),
        secret: `0x${"00".repeat(32)}`,
        resolverInitializationHash: `0x${"00".repeat(32)}`,
        normalizationAttestationHash: `0x${"00".repeat(32)}`,
        expectedAmount: 1n,
        expectedReferralRewardBps: 0,
      }, {
        addressRecord: getAddress("0x0000000000000000000000000000000000000001"),
        textKeys: [],
        textValues: [],
      }, {
        validUntil: 1n,
        signature: `0x${"00".repeat(65)}`,
      }],
    }).slice(0, 10)
    : "0x00000000";
  return {
    manifestGeneration: "v3",
    chainId: manifest.chainId,
    contractVersion: manifest.suiteVersion,
    deploymentPublished: paidReleasePublished,
    registrationMode: "commit-reveal",
    executionPlanAdapterReady: paidReleasePublished && controller !== null && registry !== null,
    calldataAllowlist: controller ? {
      commit: { target: controller, selector: commitSelector },
      reveal: { target: controller, selector: registerSelector },
    } : null,
    normalization: controller && attestor ? {
      attestor,
      controller,
      normalizationProfileHash: manifest.normalization.profileHash,
    } : null,
    settlement: {
      kind: manifest.settlement.kind,
      tokenAddress: manifest.settlement.tokenAddress,
      decimals: manifest.settlement.decimals,
    },
  };
}

/** Legacy quote normalization is read/challenge-only; it is never a paid plan. */
export function legacyV2QuotePaymentIntent(
  quote: RegistrationQuote,
  payTo: Address,
): X402RegistrationPaymentIntent {
  if (quote.terms.settlement.kind !== "erc20" || !quote.terms.settlement.asset) {
    throw new Error("Legacy native quotes cannot become x402 payment intents.");
  }
  return {
    quoteId: quote.quoteId,
    planId: null,
    chainId: quote.scope.chainId,
    network: quote.scope.network,
    resourcePath: quote.scope.resource,
    description: `Register ${quote.request.fullName}`,
    asset: getAddress(quote.terms.settlement.asset),
    amountBaseUnits: quote.terms.expectedAmountBaseUnits,
    payTo: getAddress(payTo),
    issuedAt: quote.issuedAt,
    expiresAt: quote.expiresAt,
    paymentTimeoutSeconds: Number(quote.expiresAt) - Number(quote.issuedAt),
    normalizationTypedDataDigest: null,
    controllerAttestationHash: null,
    normalizationValidUntil: null,
  };
}
