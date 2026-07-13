"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Address, erc20Abi, isAddress, keccak256, toBytes, zeroAddress } from "viem";
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

type MulticallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error?: Error };

function successful<T>(result: MulticallResult | undefined): T | undefined {
  return result?.status === "success" ? (result.result as T) : undefined;
}

function isNameStatusValue(value: unknown): value is NameStatusValue {
  return value === NAME_STATUS.UNREGISTERED
    || value === NAME_STATUS.ACTIVE
    || value === NAME_STATUS.GRACE
    || value === NAME_STATUS.RELEASED;
}

function isListingRead(value: unknown): value is NameListing | readonly unknown[] {
  if (value === null || value === undefined || typeof value !== "object") return false;
  const fields = Array.isArray(value)
    ? value
    : [
        (value as NameListing).tokenId,
        (value as NameListing).seller,
        (value as NameListing).price,
        (value as NameListing).listedAt,
        (value as NameListing).feeBps,
      ];
  return typeof fields[0] === "bigint"
    && typeof fields[1] === "string"
    && isAddress(fields[1])
    && typeof fields[2] === "bigint"
    && typeof fields[3] === "bigint"
    && typeof fields[4] === "number";
}

/**
 * Decodes one complete owned-name page. A transient or malformed multicall
 * result is rejected as a whole so partial values never reach the account UI.
 */
export function decodeOwnedNames(
  tokenIds: readonly bigint[],
  results: readonly MulticallResult[] | undefined,
): OwnedName[] | null {
  if (tokenIds.length === 0) return [];
  if (!results || results.length !== tokenIds.length * 4) return null;

  const names: OwnedName[] = [];
  for (const [index, tokenId] of tokenIds.entries()) {
    const detailOffset = index * 4;
    const fullName = successful<unknown>(results[detailOffset]);
    const status = successful<unknown>(results[detailOffset + 1]);
    const expiresAt = successful<unknown>(results[detailOffset + 2]);
    const listing = successful<unknown>(results[detailOffset + 3]);
    if (
      typeof fullName !== "string"
      || fullName.length === 0
      || !isNameStatusValue(status)
      || typeof expiresAt !== "bigint"
      || expiresAt < 0n
      || !isListingRead(listing)
    ) return null;

    names.push({
      tokenId,
      fullName,
      status,
      expiresAt,
      listing: normalizeListing(listing),
    });
  }
  return names;
}

export function multicallReadError(
  scope: string,
  results: readonly MulticallResult[] | undefined,
  requiredIndexes: readonly number[],
  readyToEvaluate: boolean,
): Error | null {
  if (!readyToEvaluate) return null;
  if (!results) return new Error(`${scope} did not return contract data.`);
  const failedIndexes = requiredIndexes.filter((index) => results[index]?.status !== "success");
  if (failedIndexes.length === 0) return null;
  return new Error(`${scope} contract reads failed at indexes ${failedIndexes.join(", ")}.`);
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
  const readStatus = successful<number>(data?.[2]);
  const requiredIndexes = readStatus !== undefined && readStatus !== NAME_STATUS.UNREGISTERED
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8]
    : [0, 1, 2, 8];
  const partialError = multicallReadError(
    "Name record",
    data,
    requiredIndexes,
    enabled && !query.isLoading && !query.isError,
  );
  const previewRecord: NameRecord = {
    label,
    tokenId,
    available: true,
    reserved: false,
    status: NAME_STATUS.UNREGISTERED,
    owner: null,
    resolvedAddress: null,
    expiresAt: null,
    profile: emptyProfile,
    listing: null,
    oneYearQuote: annualPriceForLength(
      BigInt(deploymentManifest.annualPriceBaseUnits),
      label.length,
      deploymentManifest.shortNamePriceMultipliers,
    ),
  };
  const record: NameRecord | null = !protocolDeployed
    ? previewRecord
    : partialError || query.isError || query.isLoading || readStatus === undefined
      ? null
      : {
          label,
          tokenId,
          available: successful<boolean>(data?.[0])!,
          reserved: successful<boolean>(data?.[1])!,
          status: readStatus as NameStatusValue,
          owner: readStatus === NAME_STATUS.UNREGISTERED ? null : successful<Address>(data?.[3])!,
          resolvedAddress: (() => {
            if (readStatus === NAME_STATUS.UNREGISTERED) return null;
            const value = successful<Address>(data?.[4])!;
            return value !== zeroAddress ? value : null;
          })(),
          expiresAt: readStatus === NAME_STATUS.UNREGISTERED ? null : successful<bigint>(data?.[5])!,
          profile: readStatus === NAME_STATUS.UNREGISTERED ? emptyProfile : successful<NameProfile>(data?.[6])!,
          listing: readStatus === NAME_STATUS.UNREGISTERED
            ? null
            : normalizeListing(successful<NameListing | readonly unknown[]>(data?.[7])),
          oneYearQuote: successful<bigint>(data?.[8])!,
        };

  return {
    ...query,
    record,
    error: query.error ?? partialError,
    isError: query.isError || partialError !== null,
    isPreview: !protocolDeployed,
  };
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
  const requiredDetailIndexes = recent.flatMap((_, index) => {
    const statusIndex = index * 2;
    return successful<number>(detailsQuery.data?.[statusIndex]) === NAME_STATUS.ACTIVE
      ? [statusIndex, statusIndex + 1]
      : [statusIndex];
  });
  const partialError = multicallReadError(
    "Recent name details",
    detailsQuery.data,
    requiredDetailIndexes,
    enabled && recent.length > 0 && !detailsQuery.isLoading && !detailsQuery.isError,
  );
  const names = query.isError || detailsQuery.isError || partialError ? [] : recent.flatMap((item, index): RecentRegistration[] => {
    const status = successful<number>(detailsQuery.data?.[index * 2]);
    const owner = successful<Address>(detailsQuery.data?.[index * 2 + 1]);
    if (status !== NAME_STATUS.ACTIVE || !owner) return [];
    return [{ ...item, owner }];
  });
  return {
    ...query,
    names,
    isLoading: query.isLoading || detailsQuery.isLoading,
    error: query.error ?? detailsQuery.error ?? partialError,
    isError: query.isError || detailsQuery.isError || partialError !== null,
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
  const requiredDetailIndexes = storedListings.flatMap((_, index) => {
    const detailOffset = index * 4;
    return successful<number>(detailsQuery.data?.[detailOffset + 1]) === NAME_STATUS.ACTIVE
      ? [detailOffset, detailOffset + 1, detailOffset + 2, detailOffset + 3]
      : [detailOffset + 1];
  });
  const partialError = multicallReadError(
    "Market listing details",
    detailsQuery.data,
    requiredDetailIndexes,
    enabled && storedListings.length > 0 && !detailsQuery.isLoading && !detailsQuery.isError,
  );
  const listings = query.isError || detailsQuery.isError || partialError ? [] : storedListings.flatMap((listing, index): MarketNameListing[] => {
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
    return [{ ...listing, fullName, status: NAME_STATUS.ACTIVE, expiresAt: expiresAt! }];
  });
  return {
    ...query,
    listings,
    total: query.isError ? null : tuple?.[1] ?? null,
    isLoading: query.isLoading || detailsQuery.isLoading,
    error: query.error ?? detailsQuery.error ?? partialError,
    isError: query.isError || detailsQuery.isError || partialError !== null,
  };
}

export function useVerifiedListing(tokenId: bigint | undefined, queryEnabled = true) {
  const listingQueryEnabled = enabled && tokenId !== undefined && queryEnabled;
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contract, functionName: "listings", args: [tokenId ?? 0n] },
      { ...contract, functionName: "statusOf", args: [tokenId ?? 0n] },
      { ...contract, functionName: "ownerOf", args: [tokenId ?? 0n] },
      { ...contract, functionName: "fullName", args: [tokenId ?? 0n] },
      { ...contract, functionName: "expiresAt", args: [tokenId ?? 0n] },
    ],
    query: { enabled: listingQueryEnabled, staleTime: 0 },
  });
  const rawListing = normalizeListing(successful<NameListing | readonly unknown[]>(query.data?.[0]));
  const status = successful<number>(query.data?.[1]);
  const requiredIndexes = rawListing && status === NAME_STATUS.ACTIVE ? [0, 1, 2, 3, 4] : [0, 1];
  const partialError = multicallReadError(
    "Listing verification",
    query.data,
    requiredIndexes,
    listingQueryEnabled && !query.isLoading && !query.isError,
  );
  const owner = successful<Address>(query.data?.[2]);
  const fullName = successful<string>(query.data?.[3]);
  const expiresAt = successful<bigint>(query.data?.[4]);
  const listing: MarketNameListing | null = !query.isError
    && !partialError
    && rawListing !== null
    && status === NAME_STATUS.ACTIVE
    && owner?.toLowerCase() === rawListing.seller.toLowerCase()
    && fullName !== undefined
    && expiresAt !== undefined
      ? { ...rawListing, fullName, status: NAME_STATUS.ACTIVE, expiresAt }
      : null;

  return {
    ...query,
    listing,
    error: query.error ?? partialError,
    isError: query.isError || partialError !== null,
    isStale: listingQueryEnabled
      && !query.isLoading
      && !query.isFetching
      && !query.isError
      && partialError === null
      && listing === null,
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
  const partialError = multicallReadError(
    "Protocol health",
    query.data,
    [0, 1, 2, 3, 4, 5],
    enabled && !query.isLoading && !query.isError,
  );
  const unavailable = query.isError || partialError !== null;
  return {
    ...query,
    error: query.error ?? partialError,
    isError: query.isError || partialError !== null,
    solvent: unavailable ? null : successful<boolean>(query.data?.[0]) ?? null,
    registrationsPaused: unavailable ? null : successful<boolean>(query.data?.[1]) ?? null,
    marketplacePaused: unavailable ? null : successful<boolean>(query.data?.[2]) ?? null,
    referralRewardBps: unavailable ? null : successful<number>(query.data?.[3]) ?? null,
    marketplaceFeeBps: unavailable ? null : successful<number>(query.data?.[4]) ?? null,
    nameCount: unavailable ? null : successful<bigint>(query.data?.[5]) ?? null,
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
  const readEnabled = enabled && account !== undefined;
  const balanceQuery = useReadContract({
    ...contract,
    functionName: "balanceOf",
    args: [account ?? zeroAddress],
    query: { enabled: readEnabled },
  });
  const rawTotal = balanceQuery.data;
  const resolvedTotal = balanceQuery.isError
    || typeof rawTotal !== "bigint"
    || rawTotal > BigInt(Number.MAX_SAFE_INTEGER)
      ? null
      : Number(rawTotal);
  const count = resolvedTotal === null ? 0 : Math.max(0, Math.min(limit, resolvedTotal - offset));
  const idQuery = useReadContracts({
    allowFailure: true,
    contracts: Array.from({ length: count }, (_, index) => ({
      ...contract,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [account ?? zeroAddress, BigInt(offset + index)] as const,
    })),
    query: { enabled: readEnabled && count > 0 },
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
    query: { enabled: readEnabled && tokenIds.length > 0 },
  });
  const balanceValuePending = readEnabled
    && resolvedTotal === null
    && (balanceQuery.isLoading || balanceQuery.isFetching);
  const idValuesComplete = tokenIds.length === count;
  const idValuesPending = readEnabled
    && count > 0
    && !idValuesComplete
    && (idQuery.isLoading || idQuery.isFetching);
  const decodedNames = idValuesComplete ? decodeOwnedNames(tokenIds, detailsQuery.data) : null;
  const detailValuesPending = readEnabled
    && tokenIds.length > 0
    && decodedNames === null
    && (detailsQuery.isLoading || detailsQuery.isFetching);
  const idError = multicallReadError(
    "Owned name enumeration",
    idQuery.data,
    Array.from({ length: count }, (_, index) => index),
    readEnabled && count > 0 && !idQuery.isLoading && !idQuery.isFetching && !idQuery.isError,
  );
  const detailError = multicallReadError(
    "Owned name details",
    detailsQuery.data,
    Array.from({ length: tokenIds.length * 4 }, (_, index) => index),
    readEnabled
      && tokenIds.length > 0
      && !detailsQuery.isLoading
      && !detailsQuery.isFetching
      && !detailsQuery.isError,
  );
  const balanceValueError = readEnabled
    && !balanceQuery.isLoading
    && !balanceQuery.isFetching
    && !balanceQuery.isError
    && resolvedTotal === null
      ? new Error("Owned name balance did not return a safe integer value.")
      : null;
  const idValueError = readEnabled
    && count > 0
    && !idQuery.isLoading
    && !idQuery.isFetching
    && !idQuery.isError
    && !idValuesComplete
      ? new Error("Owned name enumeration returned an incomplete token page.")
      : null;
  const detailValueError = readEnabled
    && tokenIds.length > 0
    && !detailsQuery.isLoading
    && !detailsQuery.isFetching
    && !detailsQuery.isError
    && decodedNames === null
      ? new Error("Owned name details returned incomplete or invalid values.")
      : null;
  const partialError = balanceValueError ?? idError ?? idValueError ?? detailError ?? detailValueError;
  const isLoading = balanceQuery.isLoading
    || idQuery.isLoading
    || detailsQuery.isLoading
    || balanceValuePending
    || idValuesPending
    || detailValuesPending;
  const names = balanceQuery.isError
    || idQuery.isError
    || detailsQuery.isError
    || partialError
    || isLoading
      ? []
      : decodedNames ?? [];

  return {
    names,
    isLoading,
    error: balanceQuery.error ?? idQuery.error ?? detailsQuery.error ?? partialError,
    isError: balanceQuery.isError || idQuery.isError || detailsQuery.isError || partialError !== null,
    total: resolvedTotal,
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
  const partialError = multicallReadError(
    "Account balances",
    query.data,
    [0, 1, 2],
    enabled && account !== undefined && !query.isLoading && !query.isError,
  );
  const unavailable = query.isError || partialError !== null;
  return {
    ...query,
    error: query.error ?? partialError,
    isError: query.isError || partialError !== null,
    referralBalance: unavailable ? null : successful<bigint>(query.data?.[0]) ?? null,
    sellerBalance: unavailable ? null : successful<bigint>(query.data?.[1]) ?? null,
    primaryName: unavailable ? null : successful<string>(query.data?.[2]) ?? null,
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
