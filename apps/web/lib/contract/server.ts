import {
  type Address,
  createPublicClient,
  getAddress,
  http,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import { configuredChain } from "@/lib/chain";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { annualPriceForLength } from "@/lib/pricing";
import { chainNameServiceAbi } from "./abi.generated";
import { normalizeListing } from "./normalization";
import { emptyProfile, NAME_STATUS, type NameListing, type NameProfile } from "./types";

function serverRpcUrl() {
  const value = process.env.RPC_URL?.trim() || deploymentManifest.rpcUrl;
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error("RPC_URL must be a valid HTTP(S) URL.");
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("RPC_URL must use HTTP or HTTPS.");
  }
  return value;
}

export const serverPublicClient = createPublicClient({
  chain: configuredChain,
  transport: http(serverRpcUrl(), { timeout: 12_000, retryCount: 1 }),
});

export const serverContract = protocolAddress
  ? { address: getAddress(protocolAddress), abi: chainNameServiceAbi } as const
  : null;

type ReadResult = { status: "success"; result: unknown } | { status: "failure" } | undefined;

function value<T>(result: ReadResult): T | undefined {
  return result?.status === "success" ? result.result as T : undefined;
}

export function tokenIdForLabel(label: string) {
  return BigInt(keccak256(toBytes(label)));
}

export async function readName(label: string, durationYears = 1, blockNumber?: bigint) {
  if (!serverContract) return null;
  const tokenId = tokenIdForLabel(label);
  const results = await serverPublicClient.multicall({
    allowFailure: true,
    contracts: [
      { ...serverContract, functionName: "isAvailable", args: [label] },
      { ...serverContract, functionName: "reservedLabels", args: [keccak256(toBytes(label))] },
      { ...serverContract, functionName: "statusOf", args: [tokenId] },
      { ...serverContract, functionName: "ownerOf", args: [tokenId] },
      { ...serverContract, functionName: "resolvedAddress", args: [tokenId] },
      { ...serverContract, functionName: "expiresAt", args: [tokenId] },
      { ...serverContract, functionName: "profileOf", args: [tokenId] },
      { ...serverContract, functionName: "listings", args: [tokenId] },
      { ...serverContract, functionName: "quote", args: [label, durationYears] },
      { ...serverContract, functionName: "registrationsPaused" },
      { ...serverContract, functionName: "isSolvent" },
    ],
    blockNumber,
  });
  const owner = value<Address>(results[3]);
  const resolution = value<Address>(results[4]);
  return {
    label,
    fullName: `${label}.${deploymentManifest.suffix}`,
    tokenId,
    available: value<boolean>(results[0]) ?? false,
    reserved: value<boolean>(results[1]) ?? false,
    status: value<number>(results[2]) ?? NAME_STATUS.UNREGISTERED,
    owner: owner ?? null,
    resolvedAddress: resolution && resolution !== zeroAddress ? resolution : null,
    expiresAt: value<bigint>(results[5]) ?? null,
    profile: value<NameProfile>(results[6]) ?? emptyProfile,
    listing: normalizeListing(value<NameListing | readonly unknown[]>(results[7])),
    oneYearQuote: value<bigint>(results[8]) ?? annualPriceForLength(
      BigInt(deploymentManifest.annualPriceBaseUnits),
      label.length,
      deploymentManifest.shortNamePriceMultipliers,
    ) * BigInt(durationYears),
    registrationsPaused: value<boolean>(results[9]) ?? false,
    solvent: value<boolean>(results[10]) ?? false,
  };
}

export async function readPrimaryName(account: Address, blockNumber?: bigint) {
  if (!serverContract) return null;
  return serverPublicClient.readContract({
    ...serverContract,
    functionName: "primaryNameOf",
    args: [account],
    blockNumber,
  });
}

export async function readMarket(offset: bigint, limit: bigint, blockNumber?: bigint) {
  if (!serverContract) return null;
  const [[stored, total], marketplacePaused, solvent] = await serverPublicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...serverContract, functionName: "getListings", args: [offset, limit] },
      { ...serverContract, functionName: "marketplacePaused" },
      { ...serverContract, functionName: "isSolvent" },
    ],
    blockNumber,
  });
  const details = await serverPublicClient.multicall({
    allowFailure: true,
    contracts: stored.flatMap((listing) => [
      { ...serverContract, functionName: "fullName" as const, args: [listing.tokenId] as const },
      { ...serverContract, functionName: "statusOf" as const, args: [listing.tokenId] as const },
      { ...serverContract, functionName: "ownerOf" as const, args: [listing.tokenId] as const },
      { ...serverContract, functionName: "expiresAt" as const, args: [listing.tokenId] as const },
    ]),
    blockNumber,
  });
  const listings = stored.flatMap((listing, index) => {
    const detailOffset = index * 4;
    const fullName = value<string>(details[detailOffset]);
    const status = value<number>(details[detailOffset + 1]);
    const owner = value<Address>(details[detailOffset + 2]);
    const expiresAt = value<bigint>(details[detailOffset + 3]);
    if (!fullName || status !== NAME_STATUS.ACTIVE || owner?.toLowerCase() !== listing.seller.toLowerCase()) return [];
    return [{ ...listing, fullName, status, expiresAt: expiresAt ?? 0n }];
  });
  return { listings, total, marketplacePaused, solvent, rawCount: stored.length };
}

export async function readTokenMetadata(tokenId: bigint, blockNumber?: bigint) {
  if (!serverContract) return null;
  const results = await serverPublicClient.multicall({
    allowFailure: true,
    contracts: [
      { ...serverContract, functionName: "fullName", args: [tokenId] },
      { ...serverContract, functionName: "ownerOf", args: [tokenId] },
      { ...serverContract, functionName: "statusOf", args: [tokenId] },
      { ...serverContract, functionName: "expiresAt", args: [tokenId] },
      { ...serverContract, functionName: "profileOf", args: [tokenId] },
      { ...serverContract, functionName: "resolvedAddress", args: [tokenId] },
    ],
    blockNumber,
  });
  const fullName = value<string>(results[0]);
  const owner = value<Address>(results[1]);
  if (!fullName || !owner) return undefined;
  return {
    tokenId,
    fullName,
    owner,
    status: value<number>(results[2]) ?? NAME_STATUS.UNREGISTERED,
    expiresAt: value<bigint>(results[3]) ?? 0n,
    profile: value<NameProfile>(results[4]) ?? emptyProfile,
    resolvedAddress: value<Address>(results[5]) ?? zeroAddress,
  };
}
