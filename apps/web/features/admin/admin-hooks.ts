"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { projectConfig } from "@/config/project.config";
import { resolveAdminRole } from "@/lib/admin-access";
import { deploymentManifest, protocolDeployed } from "@/lib/deployment-manifest";
import { protocolContract } from "@/lib/contract/hooks";
import { loadAdminActivity } from "./admin-data";

function successful<T>(result: { status: "success"; result: unknown } | { status: "failure" } | undefined): T | undefined {
  return result?.status === "success" ? result.result as T : undefined;
}

function presentAddress(value: Address | undefined): Address | undefined {
  return value && value !== zeroAddress ? value : undefined;
}

export function useAdminAccess() {
  const account = useAccount();
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...protocolContract, functionName: "owner" },
      { ...protocolContract, functionName: "pendingOwner" },
    ],
    query: { enabled: protocolDeployed && account.isConnected },
  });
  const owner = presentAddress(successful<Address>(query.data?.[0]));
  const pendingOwner = presentAddress(successful<Address>(query.data?.[1]));
  const role = resolveAdminRole(account.address, owner, pendingOwner, projectConfig.admin.viewerAddresses);

  return {
    account: account.address,
    chainId: account.chainId,
    isConnected: account.isConnected,
    isWrongNetwork: account.isConnected && account.chainId !== deploymentManifest.chainId,
    owner,
    pendingOwner,
    role,
    isAuthorized: role !== null,
    isOwner: role === "owner",
    isPendingOwner: role === "pending-owner",
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useAdminOverview(enabled: boolean) {
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...protocolContract, functionName: "owner" },
      { ...protocolContract, functionName: "pendingOwner" },
      { ...protocolContract, functionName: "treasury" },
      { ...protocolContract, functionName: "annualPrice" },
      { ...protocolContract, functionName: "referralRewardBps" },
      { ...protocolContract, functionName: "marketplaceFeeBps" },
      { ...protocolContract, functionName: "registrationsPaused" },
      { ...protocolContract, functionName: "marketplacePaused" },
      { ...protocolContract, functionName: "totalSupply" },
      { ...protocolContract, functionName: "getListings", args: [0n, 1n] },
      { ...protocolContract, functionName: "settlementBalance" },
      { ...protocolContract, functionName: "totalProtectedLiability" },
      { ...protocolContract, functionName: "totalReferralLiability" },
      { ...protocolContract, functionName: "totalMarketplaceLiability" },
      { ...protocolContract, functionName: "treasuryAvailableBalance" },
      { ...protocolContract, functionName: "isSolvent" },
      { ...protocolContract, functionName: "metadataBaseURI" },
      { ...protocolContract, functionName: "gracePeriod" },
      { ...protocolContract, functionName: "settlementKind" },
      { ...protocolContract, functionName: "settlementToken" },
      { ...protocolContract, functionName: "VERSION" },
    ],
    query: { enabled: protocolDeployed && enabled, refetchInterval: 30_000 },
  });
  const listingResult = successful<readonly [readonly unknown[], bigint]>(query.data?.[9]);

  return {
    ...query,
    owner: presentAddress(successful<Address>(query.data?.[0])),
    pendingOwner: presentAddress(successful<Address>(query.data?.[1])),
    treasury: presentAddress(successful<Address>(query.data?.[2])),
    annualPrice: successful<bigint>(query.data?.[3]) ?? 0n,
    referralRewardBps: successful<number>(query.data?.[4]) ?? 0,
    marketplaceFeeBps: successful<number>(query.data?.[5]) ?? 0,
    registrationsPaused: successful<boolean>(query.data?.[6]) ?? true,
    marketplacePaused: successful<boolean>(query.data?.[7]) ?? true,
    totalSupply: successful<bigint>(query.data?.[8]) ?? 0n,
    totalListings: listingResult?.[1] ?? 0n,
    settlementBalance: successful<bigint>(query.data?.[10]) ?? 0n,
    totalProtectedLiability: successful<bigint>(query.data?.[11]) ?? 0n,
    totalReferralLiability: successful<bigint>(query.data?.[12]) ?? 0n,
    totalMarketplaceLiability: successful<bigint>(query.data?.[13]) ?? 0n,
    treasuryAvailableBalance: successful<bigint>(query.data?.[14]) ?? 0n,
    solvent: successful<boolean>(query.data?.[15]) ?? false,
    metadataBaseURI: successful<string>(query.data?.[16]) ?? "",
    gracePeriod: successful<bigint>(query.data?.[17]) ?? 0n,
    settlementKind: successful<number>(query.data?.[18]) ?? 0,
    settlementToken: successful<Address>(query.data?.[19]) ?? zeroAddress,
    version: successful<string>(query.data?.[20]) ?? deploymentManifest.contractVersion,
  };
}

export function useAdminActivity(enabled: boolean) {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: [
      "admin-activity",
      deploymentManifest.chainId,
      deploymentManifest.contract,
      deploymentManifest.deploymentBlock,
    ],
    queryFn: () => {
      if (!publicClient) throw new Error("Public client is unavailable.");
      return loadAdminActivity(publicClient);
    },
    enabled: protocolDeployed && enabled && publicClient !== undefined,
    staleTime: 30_000,
  });
}

export type AdminOverviewState = ReturnType<typeof useAdminOverview>;
