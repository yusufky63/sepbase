import { getAddress } from "viem";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { legacyV2X402DeploymentProfile } from "./deployment-profile";
import type { RegistrationQuoteScope } from "./quote";

/**
 * Sole runtime boundary for the legacy single-contract V2 manifest. V3 will
 * replace this module with a multi-contract profile + execution-plan adapter.
 */
export const legacyV2X402 = Object.freeze({
  profile: legacyV2X402DeploymentProfile(deploymentManifest),
  protocolAddress,
  chainId: deploymentManifest.chainId,
  contractVersion: deploymentManifest.contractVersion,
  suffix: deploymentManifest.suffix,
  allowedYears: deploymentManifest.nameRules.allowedYears,
  settlement: deploymentManifest.settlement,
});

export function legacyV2RegistrationQuoteScope(): RegistrationQuoteScope {
  if (!protocolAddress) throw new Error("Legacy V2 deployment is unavailable.");
  return {
    chainId: deploymentManifest.chainId,
    contract: getAddress(protocolAddress),
    contractVersion: deploymentManifest.contractVersion,
    suffix: deploymentManifest.suffix,
    settlement: {
      kind: deploymentManifest.settlement.kind,
      tokenAddress: deploymentManifest.settlement.tokenAddress
        ? getAddress(deploymentManifest.settlement.tokenAddress)
        : null,
      symbol: deploymentManifest.settlement.symbol,
      decimals: deploymentManifest.settlement.decimals,
    },
  };
}
