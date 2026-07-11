import {
  type Address,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import { createContractContext, type ContractContext } from "./contract";
import { InvalidInputError, ManifestMismatchError, RpcUnavailableError, SepbaseError } from "./errors";
import { assessAddressIdentity, assessNameResolution, lifecycleFromStatus } from "./identity";
import { getMarket } from "./marketplace";
import type {
  ActiveMarketPage,
  ActiveMarketListing,
  NameProfile,
  NameState,
  ProtocolHealth,
  SettlementMetadata,
  VerifiedAddressIdentity,
  VerifiedNameResolution,
} from "./types";

export type CreateSepbaseClientOptions = {
  manifestUrl: string | URL;
  rpcUrl?: string;
  fetcher?: typeof fetch;
  allowedManifestOrigins?: readonly string[];
  allowedRpcOrigins?: readonly string[];
};

export type SepbaseClient = ContractContext & {
  resolveName(label: string): Promise<Address | null>;
  reverseLookup(account: Address): Promise<string | null>;
  getNameProfile(label: string): Promise<NameProfile | null>;
  getNameState(label: string): Promise<NameState>;
  isNameAvailable(label: string): Promise<boolean>;
  quoteName(label: string, years: 1 | 2 | 3 | 4 | 5): Promise<bigint>;
  createReferralUrl(referrer: Address): string;
  getActiveListings(cursor?: bigint, limit?: number): Promise<ActiveMarketPage>;
  getListing(tokenId: bigint): Promise<ActiveMarketListing | null>;
  getSettlementAsset(): Promise<SettlementMetadata>;
  getNativeCurrency(): { name: string; symbol: string; decimals: number };
  getProtocolHealth(): Promise<ProtocolHealth>;
  verifyAddress(account: Address): Promise<VerifiedAddressIdentity>;
  verifyName(label: string, expectedAccount?: Address): Promise<VerifiedNameResolution>;
  resolve(label: string): Promise<Address | null>;
  reverse(account: Address): Promise<string | null>;
  quote(label: string, years: 1 | 2 | 3 | 4 | 5): Promise<bigint>;
};

type ReadResult = { status: "success"; result: unknown } | { status: "failure" } | undefined;

type ContractListing = {
  tokenId: bigint;
  seller: Address;
  price: bigint;
  listedAt: bigint;
  feeBps: number;
};

function normalizeContractListing(input: unknown): ContractListing | null {
  if (!input) return null;
  const listing: {
    tokenId: unknown;
    seller: unknown;
    price: unknown;
    listedAt: unknown;
    feeBps: unknown;
  } = Array.isArray(input)
    ? { tokenId: input[0], seller: input[1], price: input[2], listedAt: input[3], feeBps: input[4] }
    : input as ContractListing;
  if (
    typeof listing.tokenId !== "bigint"
    || typeof listing.seller !== "string"
    || typeof listing.price !== "bigint"
    || typeof listing.listedAt !== "bigint"
    || typeof listing.feeBps !== "number"
    || !isAddress(listing.seller)
  ) return null;
  return listing as ContractListing;
}

function value<T>(result: ReadResult) {
  return result?.status === "success" ? result.result as T : undefined;
}

function isEffective(status: number) {
  return status === 1 || status === 2;
}

function assertSafeUrl(value: string | URL, label: string) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new InvalidInputError(`${label} must use HTTPS outside local development.`);
  }
  return url;
}

async function safeRead<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SepbaseError) throw error;
    throw new RpcUnavailableError();
  }
}

export async function createSepbaseClient(
  input: string | URL | CreateSepbaseClientOptions,
  legacyFetcher: typeof fetch = fetch,
): Promise<SepbaseClient> {
  const options: CreateSepbaseClientOptions = typeof input === "string" || input instanceof URL
    ? { manifestUrl: input, fetcher: legacyFetcher }
    : input;
  const manifestUrl = assertSafeUrl(options.manifestUrl, "Manifest URL");
  if (options.rpcUrl) assertSafeUrl(options.rpcUrl, "RPC URL");
  if (
    options.allowedManifestOrigins
    && !options.allowedManifestOrigins.map((origin) => new URL(origin).origin).includes(manifestUrl.origin)
  ) {
    throw new InvalidInputError("Manifest origin is not in the explicit allowlist.");
  }

  const fetcher = options.fetcher ?? fetch;
  const context = await createContractContext(
    manifestUrl,
    fetcher,
    options.rpcUrl,
    options.allowedRpcOrigins,
  );
  const contract = { address: context.manifest.contract!, abi: context.abi } as const;
  const tokenIdFor = (label: string) => BigInt(keccak256(toBytes(label)));

  function validLabel(inputLabel: string) {
    const normalized = normalizeLabel(inputLabel, context.manifest.suffix);
    if (!isValidLabel(normalized, context.manifest.nameRules)) {
      throw new InvalidInputError("Label does not satisfy the deployment name rules.");
    }
    return normalized;
  }

  function validAddress(account: Address | string) {
    if (!isAddress(account)) throw new InvalidInputError("Account is not a valid EVM address.");
    return getAddress(account);
  }

  async function resolveName(label: string): Promise<Address | null> {
    const normalized = validLabel(label);
    return safeRead(async () => {
      const resolved = await context.publicClient.readContract({
        ...contract,
        functionName: "resolve",
        args: [normalized],
      }) as Address;
      return resolved === zeroAddress ? null : getAddress(resolved);
    });
  }

  async function reverseLookup(account: Address): Promise<string | null> {
    const normalizedAccount = validAddress(account);
    return safeRead(async () => {
      const name = await context.publicClient.readContract({
        ...contract,
        functionName: "primaryNameOf",
        args: [normalizedAccount],
      }) as string;
      return name || null;
    });
  }

  async function quoteName(label: string, years: 1 | 2 | 3 | 4 | 5): Promise<bigint> {
    const normalized = validLabel(label);
    if (!context.manifest.nameRules.allowedYears.includes(years)) {
      throw new InvalidInputError("Unsupported registration duration.");
    }
    return safeRead(async () => context.publicClient.readContract({
      ...contract,
      functionName: "quote",
      args: [normalized, years],
    }) as Promise<bigint>);
  }

  async function getNameState(label: string): Promise<NameState> {
    const normalized = validLabel(label);
    return safeRead(async () => {
      const blockNumber = await context.publicClient.getBlockNumber();
      const results = await context.publicClient.multicall({
        allowFailure: true,
        blockNumber,
        contracts: [
          { ...contract, functionName: "statusOf", args: [tokenIdFor(normalized)] },
          { ...contract, functionName: "reservedLabels", args: [keccak256(toBytes(normalized))] },
          { ...contract, functionName: "isAvailable", args: [normalized] },
          { ...contract, functionName: "registrationsPaused" },
          { ...contract, functionName: "isSolvent" },
        ],
      });
      const status = value<number>(results[0]) ?? 0;
      const reserved = value<boolean>(results[1]) ?? false;
      const available = value<boolean>(results[2]) ?? false;
      const registrationsPaused = value<boolean>(results[3]) ?? false;
      const solvent = value<boolean>(results[4]) ?? false;
      return {
        lifecycle: lifecycleFromStatus(status),
        reserved,
        available,
        registrationsPaused,
        solvent,
        canRegister: available && !registrationsPaused && solvent,
        blockNumber,
      };
    });
  }

  async function getNameProfile(label: string): Promise<NameProfile | null> {
    const normalized = validLabel(label);
    return safeRead(async () => {
      const tokenId = tokenIdFor(normalized);
      const results = await context.publicClient.multicall({
        allowFailure: true,
        contracts: [
          { ...contract, functionName: "statusOf", args: [tokenId] },
          { ...contract, functionName: "profileOf", args: [tokenId] },
        ],
      });
      const status = value<number>(results[0]) ?? 0;
      return isEffective(status) ? value<NameProfile>(results[1]) ?? null : null;
    });
  }

  async function getListing(tokenId: bigint): Promise<ActiveMarketListing | null> {
    if (tokenId < 0n) throw new InvalidInputError("Token ID cannot be negative.");
    return safeRead(async () => {
      const results = await context.publicClient.multicall({
        allowFailure: true,
        contracts: [
          { ...contract, functionName: "listings", args: [tokenId] },
          { ...contract, functionName: "statusOf", args: [tokenId] },
          { ...contract, functionName: "ownerOf", args: [tokenId] },
          { ...contract, functionName: "fullName", args: [tokenId] },
          { ...contract, functionName: "expiresAt", args: [tokenId] },
          { ...contract, functionName: "marketplacePaused" },
          { ...contract, functionName: "isSolvent" },
        ],
      });
      const listing = normalizeContractListing(value<unknown>(results[0]));
      const status = value<number>(results[1]) ?? 0;
      const owner = value<Address>(results[2]);
      const fullName = value<string>(results[3]);
      if (
        !listing
        || listing.seller === zeroAddress
        || status !== 1
        || !owner
        || owner.toLowerCase() !== listing.seller.toLowerCase()
        || !fullName
      ) return null;
      return {
        ...listing,
        label: fullName.slice(0, -(`.${context.manifest.suffix}`).length),
        fullName,
        expiresAt: value<bigint>(results[4]) ?? 0n,
        purchasable: !(value<boolean>(results[5]) ?? true) && (value<boolean>(results[6]) ?? false),
      };
    });
  }

  async function getActiveListings(cursor = 0n, limit = 24): Promise<ActiveMarketPage> {
    if (cursor < 0n) throw new InvalidInputError("Market cursor cannot be negative.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new InvalidInputError("Market limit must be 1 to 50.");
    const response = await getMarket(
      new URL("/", context.origin),
      { cursor: cursor.toString(), limit, path: context.manifest.marketApiUrl },
      fetcher,
    );
    const api = response.context;
    const manifest = context.manifest;
    const sameAddress = (left: string | null, right: string | null) => {
      if (left === null || right === null) return left === right;
      return getAddress(left) === getAddress(right);
    };
    if (
      api.contractVersion !== manifest.contractVersion
      || api.chainId !== manifest.chainId
      || api.chainName !== manifest.chainName
      || !sameAddress(api.contract, manifest.contract)
      || api.suffix !== manifest.suffix
      || api.nameRules.minLength !== manifest.nameRules.minLength
      || api.nameRules.maxLength !== manifest.nameRules.maxLength
      || api.nameRules.allowedYears.join(",") !== manifest.nameRules.allowedYears.join(",")
      || api.settlement.kind !== manifest.settlement.kind
      || !sameAddress(api.settlement.tokenAddress, manifest.settlement.tokenAddress)
      || api.settlement.name !== manifest.settlement.name
      || api.settlement.symbol !== manifest.settlement.symbol
      || api.settlement.decimals !== manifest.settlement.decimals
      || api.pricing.standardAnnualPriceBaseUnits !== manifest.annualPriceBaseUnits
      || api.pricing.shortNamePriceMultipliers.join(",") !== manifest.shortNamePriceMultipliers.join(",")
      || JSON.stringify(api.pricing.referenceFiat) !== JSON.stringify(manifest.referenceFiat)
    ) throw new ManifestMismatchError("Market API context does not match the loaded deployment manifest.");
    return {
      ...response,
      items: response.items.map((item) => ({
        tokenId: BigInt(item.tokenId),
        label: item.label,
        fullName: item.fullName,
        seller: getAddress(item.seller),
        price: BigInt(item.priceBaseUnits),
        feeBps: item.feeBps,
        listedAt: BigInt(item.listedAt),
        expiresAt: BigInt(item.expiresAt),
        purchasable: item.purchasable,
      })),
      blockNumber: BigInt(response.blockNumber),
      nextCursor: response.nextCursor === null ? null : BigInt(response.nextCursor),
    };
  }

  async function getProtocolHealth(): Promise<ProtocolHealth> {
    return safeRead(async () => {
      const [settlementBalance, protectedLiability, solvent] = await Promise.all([
        context.publicClient.readContract({ ...contract, functionName: "settlementBalance" }),
        context.publicClient.readContract({ ...contract, functionName: "totalProtectedLiability" }),
        context.publicClient.readContract({ ...contract, functionName: "isSolvent" }),
      ]);
      return {
        settlementBalance: settlementBalance as bigint,
        protectedLiability: protectedLiability as bigint,
        solvent: solvent as boolean,
      };
    });
  }

  async function verifyAddress(account: Address): Promise<VerifiedAddressIdentity> {
    const normalizedAccount = validAddress(account);
    return safeRead(async () => {
      const blockNumber = await context.publicClient.getBlockNumber();
      const primaryName = await context.publicClient.readContract({
        ...contract,
        functionName: "primaryNameOf",
        args: [normalizedAccount],
        blockNumber,
      }) as string;
      if (!primaryName) {
        return assessAddressIdentity({
          account: normalizedAccount,
          primaryName: null,
          label: null,
          tokenId: null,
          status: 0,
          owner: null,
          resolvedAddress: null,
          fullName: null,
          expiresAt: null,
          blockNumber,
        });
      }
      const suffix = `.${context.manifest.suffix}`;
      const label = primaryName.endsWith(suffix) ? primaryName.slice(0, -suffix.length) : null;
      if (!label || !isValidLabel(label, context.manifest.nameRules)) {
        return assessAddressIdentity({
          account: normalizedAccount,
          primaryName,
          label: null,
          tokenId: null,
          status: 0,
          owner: null,
          resolvedAddress: null,
          fullName: null,
          expiresAt: null,
          blockNumber,
        });
      }
      const tokenId = tokenIdFor(label);
      const results = await context.publicClient.multicall({
        allowFailure: true,
        blockNumber,
        contracts: [
          { ...contract, functionName: "statusOf", args: [tokenId] },
          { ...contract, functionName: "ownerOf", args: [tokenId] },
          { ...contract, functionName: "resolvedAddress", args: [tokenId] },
          { ...contract, functionName: "fullName", args: [tokenId] },
          { ...contract, functionName: "expiresAt", args: [tokenId] },
        ],
      });
      const owner = value<Address>(results[1]) ?? null;
      const resolved = value<Address>(results[2]);
      return assessAddressIdentity({
        account: normalizedAccount,
        primaryName,
        label,
        tokenId,
        status: value<number>(results[0]) ?? 0,
        owner,
        resolvedAddress: resolved && resolved !== zeroAddress ? resolved : null,
        fullName: value<string>(results[3]) ?? null,
        expiresAt: value<bigint>(results[4]) ?? null,
        blockNumber,
      });
    });
  }

  async function verifyName(label: string, expectedAccount?: Address): Promise<VerifiedNameResolution> {
    const normalized = validLabel(label);
    const expectedAddress = expectedAccount ? validAddress(expectedAccount) : null;
    return safeRead(async () => {
      const blockNumber = await context.publicClient.getBlockNumber();
      const tokenId = tokenIdFor(normalized);
      const results = await context.publicClient.multicall({
        allowFailure: true,
        blockNumber,
        contracts: [
          { ...contract, functionName: "statusOf", args: [tokenId] },
          { ...contract, functionName: "ownerOf", args: [tokenId] },
          { ...contract, functionName: "resolvedAddress", args: [tokenId] },
          { ...contract, functionName: "fullName", args: [tokenId] },
          { ...contract, functionName: "expiresAt", args: [tokenId] },
        ],
      });
      const owner = value<Address>(results[1]) ?? null;
      const resolved = value<Address>(results[2]);
      const resolvedAddress = resolved && resolved !== zeroAddress ? getAddress(resolved) : null;
      const fullName = value<string>(results[3]) ?? `${normalized}.${context.manifest.suffix}`;
      const primaryName = resolvedAddress
        ? await context.publicClient.readContract({
            ...contract,
            functionName: "primaryNameOf",
            args: [resolvedAddress],
            blockNumber,
          }) as string
        : "";
      return assessNameResolution({
        label: normalized,
        fullName,
        tokenId,
        status: value<number>(results[0]) ?? 0,
        owner,
        resolvedAddress,
        primaryName: primaryName || null,
        expectedAddress,
        expiresAt: value<bigint>(results[4]) ?? null,
        blockNumber,
      });
    });
  }

  return {
    ...context,
    resolveName,
    reverseLookup,
    getNameProfile,
    getNameState,
    isNameAvailable: async (label: string) => (await getNameState(label)).available,
    quoteName,
    createReferralUrl: (referrer: Address) => {
      const address = validAddress(referrer);
      return new URL(`/r/${address}`, context.origin).href;
    },
    getActiveListings,
    getListing,
    getSettlementAsset: async () => context.manifest.settlement,
    getNativeCurrency: () => context.manifest.nativeCurrency,
    getProtocolHealth,
    verifyAddress,
    verifyName,
    resolve: resolveName,
    reverse: reverseLookup,
    quote: quoteName,
  };
}

export function normalizeLabel(input: string, suffix: string): string {
  let value = input.trim().toLowerCase();
  const ending = `.${suffix}`;
  if (value.endsWith(ending)) value = value.slice(0, -ending.length);
  return value;
}

export function isValidLabel(
  label: string,
  rules: { minLength: number; maxLength: number } = { minLength: 1, maxLength: 32 },
): boolean {
  return label.length >= rules.minLength
    && label.length <= rules.maxLength
    && /^(?!-)(?!.*--)[a-z0-9-]+(?<!-)$/.test(label);
}
