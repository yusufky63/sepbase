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
import { chainNameServiceAbi } from "./abi.generated";
import { normalizeListing } from "./normalization";
import { NAME_STATUS, type NameListing, type NameProfile } from "./types";

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

export class PartialContractReadError extends Error {
  constructor(read: string) {
    super(`Required contract read failed: ${read}.`);
    this.name = "PartialContractReadError";
  }
}

function requiredValue<T>(result: ReadResult, read: string): T {
  const resultValue = value<T>(result);
  if (resultValue === undefined) throw new PartialContractReadError(read);
  return resultValue;
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
  const available = requiredValue<boolean>(results[0], "isAvailable");
  const reserved = requiredValue<boolean>(results[1], "reservedLabels");
  const status = requiredValue<number>(results[2], "statusOf");
  const owner = value<Address>(results[3]);
  const resolution = requiredValue<Address>(results[4], "resolvedAddress");
  const expiration = requiredValue<bigint>(results[5], "expiresAt");
  const profile = value<NameProfile>(results[6]);
  const listing = requiredValue<NameListing | readonly unknown[]>(results[7], "listings");
  const quote = requiredValue<bigint>(results[8], "quote");
  const registrationsPaused = requiredValue<boolean>(results[9], "registrationsPaused");
  const solvent = requiredValue<boolean>(results[10], "isSolvent");
  const tokenExists = status !== NAME_STATUS.UNREGISTERED;
  if (tokenExists && owner === undefined) throw new PartialContractReadError("ownerOf");
  if (tokenExists && profile === undefined) throw new PartialContractReadError("profileOf");
  if (!tokenExists && owner !== undefined) {
    throw new PartialContractReadError("statusOf/ownerOf consistency");
  }
  return {
    label,
    fullName: `${label}.${deploymentManifest.suffix}`,
    tokenId,
    available,
    reserved,
    status,
    owner: owner ?? null,
    resolvedAddress: resolution && resolution !== zeroAddress ? resolution : null,
    expiresAt: tokenExists ? expiration : null,
    profile: profile ?? null,
    listing: normalizeListing(listing),
    oneYearQuote: quote,
    registrationsPaused,
    solvent,
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
    if (fullName === undefined) throw new PartialContractReadError("fullName");
    if (status === undefined) throw new PartialContractReadError("statusOf");
    if (owner === undefined) throw new PartialContractReadError("ownerOf");
    if (expiresAt === undefined) throw new PartialContractReadError("expiresAt");
    if (!fullName || status !== NAME_STATUS.ACTIVE || owner?.toLowerCase() !== listing.seller.toLowerCase()) return [];
    return [{ ...listing, fullName, status, expiresAt }];
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
  const status = requiredValue<number>(results[2], "statusOf");
  const expiresAt = requiredValue<bigint>(results[3], "expiresAt");
  const resolvedAddress = requiredValue<Address>(results[5], "resolvedAddress");
  const fullName = value<string>(results[0]);
  const owner = value<Address>(results[1]);
  const profile = value<NameProfile>(results[4]);
  if (status === NAME_STATUS.UNREGISTERED) {
    if (fullName !== undefined || owner !== undefined || profile !== undefined) {
      throw new PartialContractReadError("statusOf/token metadata consistency");
    }
    return undefined;
  }
  if (!fullName) throw new PartialContractReadError("fullName");
  if (!owner) throw new PartialContractReadError("ownerOf");
  if (profile === undefined) throw new PartialContractReadError("profileOf");
  return {
    tokenId,
    fullName,
    owner,
    status,
    expiresAt,
    profile,
    resolvedAddress,
  };
}
