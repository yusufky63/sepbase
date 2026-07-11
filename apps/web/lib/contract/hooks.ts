"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Address, erc20Abi, keccak256, toBytes, zeroAddress } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest, protocolAddress, protocolDeployed } from "@/lib/deployment-manifest";
import { annualPriceForLength } from "@/lib/pricing";
import { chainNameServiceAbi } from "./abi.generated";
import { normalizeListing } from "./normalization";
import {
  emptyProfile,
  NAME_STATUS,
  type NameListing,
  type MarketNameListing,
  type NameProfile,
  type NameRecord,
  type NameStatusValue,
  type OwnedName,
  type RecentRegistration,
} from "./types";

const address = (protocolAddress ?? zeroAddress) as Address;
const contract = { address, abi: chainNameServiceAbi } as const;
const enabled = protocolDeployed;

function successful<T>(result: { status: "success"; result: unknown } | { status: "failure" } | undefined): T | undefined {
  return result?.status === "success" ? (result.result as T) : undefined;
}

function normalizeProfile(value: NameProfile | undefined): NameProfile {
  return value ?? emptyProfile;
}

export function tokenIdForLabel(label: string): bigint {
  return BigInt(keccak256(toBytes(label)));
}

export function useNameRecord(label: string) {
  const tokenId = useMemo(() => tokenIdForLabel(label), [label]);
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contract, functionName: "isAvailable", args: [label] },
      { ...contract, functionName: "reservedLabels", args: [keccak256(toBytes(label))] },
      { ...contract, functionName: "statusOf", args: [tokenId] },
      { ...contract, functionName: "ownerOf", args: [tokenId] },
      { ...contract, functionName: "resolvedAddress", args: [tokenId] },
      { ...contract, functionName: "expiresAt", args: [tokenId] },
      { ...contract, functionName: "profileOf", args: [tokenId] },
      { ...contract, functionName: "listings", args: [tokenId] },
      { ...contract, functionName: "quote", args: [label, 1] },
    ],
    query: { enabled },
  });

  const data = query.data;
  const record: NameRecord = {
    label,
    tokenId,
    available: successful<boolean>(data?.[0]) ?? !protocolDeployed,
    reserved: successful<boolean>(data?.[1]) ?? false,
    status: (successful<number>(data?.[2]) ?? NAME_STATUS.UNREGISTERED) as NameStatusValue,
    owner: successful<Address>(data?.[3]) ?? null,
    resolvedAddress: (() => {
      const value = successful<Address>(data?.[4]);
      return value && value !== zeroAddress ? value : null;
    })(),
    expiresAt: successful<bigint>(data?.[5]) ?? null,
    profile: normalizeProfile(successful<NameProfile>(data?.[6])),
    listing: normalizeListing(successful<NameListing | readonly unknown[]>(data?.[7])),
    oneYearQuote: successful<bigint>(data?.[8]) ?? annualPriceForLength(
      BigInt(deploymentManifest.annualPriceBaseUnits),
      label.length,
      deploymentManifest.shortNamePriceMultipliers,
    ),
  };

  return { record, ...query, isPreview: !protocolDeployed };
}

export function useNameAvailability(label: string, valid: boolean) {
  return useReadContract({
    ...contract,
    functionName: "isAvailable",
    args: [label],
    query: { enabled: enabled && valid },
  });
}

export function useRecentNames(limit = 8) {
  const query = useReadContract({
    ...contract,
    functionName: "getRecentRegistrations",
    args: [BigInt(limit)],
    query: { enabled },
  });
  const recent = ((query.data ?? []) as readonly RecentRegistration[]).filter(
    (item, index, values) => values.findIndex((candidate) => candidate.tokenId === item.tokenId) === index,
  );
  const detailsQuery = useReadContracts({
    allowFailure: true,
    contracts: recent.flatMap((item) => [
      { ...contract, functionName: "statusOf" as const, args: [item.tokenId] as const },
      { ...contract, functionName: "ownerOf" as const, args: [item.tokenId] as const },
    ]),
    query: { enabled: enabled && recent.length > 0 },
  });
  const names = recent.flatMap((item, index): RecentRegistration[] => {
    const status = successful<number>(detailsQuery.data?.[index * 2]);
    const owner = successful<Address>(detailsQuery.data?.[index * 2 + 1]);
    if (status !== NAME_STATUS.ACTIVE || !owner) return [];
    return [{ ...item, owner }];
  });
  return {
    ...query,
    names,
    isLoading: query.isLoading || detailsQuery.isLoading,
    error: query.error ?? detailsQuery.error,
    isError: query.isError || detailsQuery.isError,
  };
}

export function useMarketListings(offset = 0) {
  const query = useReadContract({
    ...contract,
    functionName: "getListings",
    args: [BigInt(offset), BigInt(projectConfig.marketplace.listingsPerPage)],
    query: { enabled },
  });
  const tuple = query.data as readonly [readonly NameListing[], bigint] | undefined;
  const storedListings = tuple?.[0] ?? [];
  const detailsQuery = useReadContracts({
    allowFailure: true,
    contracts: storedListings.flatMap((listing) => [
      { ...contract, functionName: "fullName" as const, args: [listing.tokenId] as const },
      { ...contract, functionName: "statusOf" as const, args: [listing.tokenId] as const },
      { ...contract, functionName: "ownerOf" as const, args: [listing.tokenId] as const },
      { ...contract, functionName: "expiresAt" as const, args: [listing.tokenId] as const },
    ]),
    query: { enabled: enabled && storedListings.length > 0 },
  });
  const listings = storedListings.flatMap((listing, index): MarketNameListing[] => {
    const detailOffset = index * 4;
    const fullName = successful<string>(detailsQuery.data?.[detailOffset]);
    const status = successful<number>(detailsQuery.data?.[detailOffset + 1]);
    const owner = successful<Address>(detailsQuery.data?.[detailOffset + 2]);
    const expiresAt = successful<bigint>(detailsQuery.data?.[detailOffset + 3]);
    if (
      !fullName
      || status !== NAME_STATUS.ACTIVE
      || owner?.toLowerCase() !== listing.seller.toLowerCase()
    ) return [];
    return [{ ...listing, fullName, status: NAME_STATUS.ACTIVE, expiresAt: expiresAt ?? 0n }];
  });
  return {
    ...query,
    listings,
    total: tuple?.[1] ?? 0n,
    isLoading: query.isLoading || detailsQuery.isLoading,
    error: query.error ?? detailsQuery.error,
  };
}

export function useProtocolHealth() {
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contract, functionName: "isSolvent" },
      { ...contract, functionName: "registrationsPaused" },
      { ...contract, functionName: "marketplacePaused" },
      { ...contract, functionName: "referralRewardBps" },
      { ...contract, functionName: "marketplaceFeeBps" },
      { ...contract, functionName: "totalSupply" },
    ],
    query: { enabled, staleTime: 20_000 },
  });
  return {
    ...query,
    solvent: successful<boolean>(query.data?.[0]) ?? !protocolDeployed,
    registrationsPaused: successful<boolean>(query.data?.[1]) ?? protocolDeployed,
    marketplacePaused: successful<boolean>(query.data?.[2]) ?? protocolDeployed,
    referralRewardBps: successful<number>(query.data?.[3]) ?? deploymentManifest.referralRewardBps,
    marketplaceFeeBps: successful<number>(query.data?.[4]) ?? deploymentManifest.marketplaceFeeBps,
    nameCount: successful<bigint>(query.data?.[5]) ?? null,
  };
}

export function useDeploymentConsistency() {
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contract, functionName: "VERSION" },
      { ...contract, functionName: "name" },
      { ...contract, functionName: "symbol" },
      { ...contract, functionName: "suffix" },
      { ...contract, functionName: "metadataBaseURI" },
      { ...contract, functionName: "settlementKind" },
      { ...contract, functionName: "settlementToken" },
      { ...contract, functionName: "annualPrice" },
      { ...contract, functionName: "gracePeriod" },
      { ...contract, functionName: "referralRewardBps" },
      { ...contract, functionName: "marketplaceFeeBps" },
      { ...contract, functionName: "owner" },
      { ...contract, functionName: "treasury" },
      { ...contract, functionName: "quote", args: ["a", 1] },
      { ...contract, functionName: "quote", args: ["aa", 1] },
      { ...contract, functionName: "quote", args: ["aaa", 1] },
      { ...contract, functionName: "quote", args: ["aaaa", 1] },
    ],
    query: { enabled },
  });
  const token = (deploymentManifest.settlement.tokenAddress ?? zeroAddress) as Address;
  const tokenQuery = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: token, abi: erc20Abi, functionName: "name" },
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "decimals" },
    ],
    query: { enabled: enabled && deploymentManifest.settlement.kind === "erc20" },
  });
  if (!protocolDeployed) {
    return { ready: false, consistent: false, mismatches: [] as string[], isLoading: false, error: null };
  }
  const expectedKind = deploymentManifest.settlement.kind === "native" ? 0 : 1;
  const expectedToken = deploymentManifest.settlement.tokenAddress ?? zeroAddress;
  const standardAnnualPrice = BigInt(deploymentManifest.annualPriceBaseUnits);
  const checks: Array<[string, unknown, unknown]> = [
    ["VERSION", successful<string>(query.data?.[0]), deploymentManifest.contractVersion],
    ["collection name", successful<string>(query.data?.[1]), deploymentManifest.collection.name],
    ["collection symbol", successful<string>(query.data?.[2]), deploymentManifest.collection.symbol],
    ["suffix", successful<string>(query.data?.[3]), deploymentManifest.suffix],
    ["metadata base URI", successful<string>(query.data?.[4]), deploymentManifest.metadataBaseURI],
    ["settlement kind", successful<number>(query.data?.[5]), expectedKind],
    ["settlement token", successful<Address>(query.data?.[6])?.toLowerCase(), expectedToken.toLowerCase()],
    ["annual price", successful<bigint>(query.data?.[7])?.toString(), deploymentManifest.annualPriceBaseUnits],
    ["grace period", successful<bigint>(query.data?.[8])?.toString(), deploymentManifest.gracePeriodSeconds],
    ["referral reward", successful<number>(query.data?.[9]), deploymentManifest.referralRewardBps],
    ["marketplace fee", successful<number>(query.data?.[10]), deploymentManifest.marketplaceFeeBps],
    ["owner", successful<Address>(query.data?.[11])?.toLowerCase(), deploymentManifest.owner?.toLowerCase()],
    ["treasury", successful<Address>(query.data?.[12])?.toLowerCase(), deploymentManifest.treasury?.toLowerCase()],
    ["one-character quote", successful<bigint>(query.data?.[13]), annualPriceForLength(standardAnnualPrice, 1, deploymentManifest.shortNamePriceMultipliers)],
    ["two-character quote", successful<bigint>(query.data?.[14]), annualPriceForLength(standardAnnualPrice, 2, deploymentManifest.shortNamePriceMultipliers)],
    ["three-character quote", successful<bigint>(query.data?.[15]), annualPriceForLength(standardAnnualPrice, 3, deploymentManifest.shortNamePriceMultipliers)],
    ["standard quote", successful<bigint>(query.data?.[16]), standardAnnualPrice],
  ];
  if (deploymentManifest.settlement.kind === "erc20") {
    checks.push(
      ["settlement token name", successful<string>(tokenQuery.data?.[0]), deploymentManifest.settlement.name],
      ["settlement token symbol", successful<string>(tokenQuery.data?.[1]), deploymentManifest.settlement.symbol],
      ["settlement token decimals", successful<number>(tokenQuery.data?.[2]), deploymentManifest.settlement.decimals],
    );
  }
  const mismatches = checks
    .filter(([, actual, expected]) => actual === undefined || expected === undefined || actual !== expected)
    .map(([label]) => label);
  const isLoading = query.isLoading || tokenQuery.isLoading;
  const error = query.error ?? tokenQuery.error;
  return {
    ready: !isLoading && !error && mismatches.length === 0,
    consistent: mismatches.length === 0,
    mismatches,
    isLoading,
    error,
  };
}

export function useOwnedNames(
  account: Address | undefined,
  offset = 0,
  limit = projectConfig.marketplace.listingsPerPage,
) {
  const balanceQuery = useReadContract({
    ...contract,
    functionName: "balanceOf",
    args: [account ?? zeroAddress],
    query: { enabled: enabled && account !== undefined },
  });
  const total = Number(balanceQuery.data ?? 0n);
  const count = Math.max(0, Math.min(limit, total - offset));
  const idQuery = useReadContracts({
    allowFailure: true,
    contracts: Array.from({ length: count }, (_, index) => ({
      ...contract,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [account ?? zeroAddress, BigInt(offset + index)] as const,
    })),
    query: { enabled: enabled && account !== undefined && count > 0 },
  });
  const tokenIds = (idQuery.data ?? [])
    .map((item) => successful<bigint>(item))
    .filter((item): item is bigint => item !== undefined);
  const detailsQuery = useReadContracts({
    allowFailure: true,
    contracts: tokenIds.flatMap((tokenId) => [
      { ...contract, functionName: "fullName" as const, args: [tokenId] as const },
      { ...contract, functionName: "statusOf" as const, args: [tokenId] as const },
      { ...contract, functionName: "expiresAt" as const, args: [tokenId] as const },
      { ...contract, functionName: "listings" as const, args: [tokenId] as const },
    ]),
    query: { enabled: enabled && tokenIds.length > 0 },
  });

  const names: OwnedName[] = tokenIds.map((tokenId, index) => {
    const offset = index * 4;
    return {
      tokenId,
      fullName: successful<string>(detailsQuery.data?.[offset]) ?? `#${tokenId}`,
      status: (successful<number>(detailsQuery.data?.[offset + 1]) ?? NAME_STATUS.UNREGISTERED) as NameStatusValue,
      expiresAt: successful<bigint>(detailsQuery.data?.[offset + 2]) ?? 0n,
      listing: normalizeListing(successful<NameListing | readonly unknown[]>(detailsQuery.data?.[offset + 3])),
    };
  });

  return {
    names,
    isLoading: balanceQuery.isLoading || idQuery.isLoading || detailsQuery.isLoading,
    error: balanceQuery.error ?? idQuery.error ?? detailsQuery.error,
    total,
    offset,
    limit,
  };
}

export function useAccountBalances(account: Address | undefined) {
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contract, functionName: "referralBalance", args: [account ?? zeroAddress] },
      { ...contract, functionName: "sellerBalance", args: [account ?? zeroAddress] },
      { ...contract, functionName: "primaryNameOf", args: [account ?? zeroAddress] },
    ],
    query: { enabled: enabled && account !== undefined },
  });
  return {
    ...query,
    referralBalance: successful<bigint>(query.data?.[0]) ?? 0n,
    sellerBalance: successful<bigint>(query.data?.[1]) ?? 0n,
    primaryName: successful<string>(query.data?.[2]) ?? "",
  };
}

type ProtocolWrite = {
  functionName: string;
  args?: readonly unknown[];
  value?: bigint | undefined;
};

export function useProtocolTransaction() {
  const { address: account, chainId } = useAccount();
  const publicClient = usePublicClient();
  const deployment = useDeploymentConsistency();
  const queryClient = useQueryClient();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [simulationError, setSimulationError] = useState<Error | null>(null);
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash,
    confirmations: deploymentManifest.requiredConfirmations,
    query: { enabled: hash !== undefined },
  });

  const refreshActiveQueries = useCallback(async () => {
    await queryClient.invalidateQueries({ refetchType: "none" });
    await queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  useEffect(() => {
    if (!receipt.isSuccess) return;
    void refreshActiveQueries();
  }, [receipt.isSuccess, refreshActiveQueries]);

  const send = useCallback(
    async ({ functionName, args = [], value }: ProtocolWrite) => {
      setSimulationError(null);
      setHash(undefined);
      write.reset();
      try {
        if (!protocolAddress) throw new Error("Contract not deployed.");
        if (!deployment.ready) throw new Error("Deployment configuration mismatch.");
        if (!account || !publicClient) throw new Error("Wallet not connected.");
        if (chainId !== deploymentManifest.chainId) throw new Error("Wrong network.");
        const simulation = await publicClient.simulateContract({
          account,
          address: protocolAddress,
          abi: chainNameServiceAbi,
          functionName,
          args,
          ...(value !== undefined ? { value } : {}),
        } as never);
        const nextHash = await write.writeContractAsync(simulation.request as never);
        setHash(nextHash);
        return nextHash;
      } catch (error) {
        setSimulationError(error instanceof Error ? error : new Error(String(error)));
        await refreshActiveQueries();
        return undefined;
      }
    },
    [account, chainId, deployment.ready, publicClient, refreshActiveQueries, write],
  );

  const reset = useCallback(() => {
    setHash(undefined);
    setSimulationError(null);
    write.reset();
  }, [write]);

  return {
    send,
    reset,
    hash,
    error: simulationError ?? write.error ?? receipt.error,
    isPending: write.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    refreshActiveQueries,
  };
}

export function useQuote(label: string, years: number, queryEnabled = true) {
  return useReadContract({
    ...contract,
    functionName: "quote",
    args: [label, years],
    query: {
      enabled: enabled
        && queryEnabled
        && projectConfig.names.allowedYears.some((allowed) => allowed === years),
    },
  });
}

export const protocolContract = contract;
