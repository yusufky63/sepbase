import { getAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { ManifestMismatchError, SepbaseError, UnsupportedSchemaError } from "./errors.js";
import { assertSafeFetchResponse } from "./manifest.js";

export const V3_SUITE_MODULE_KEYS = [
  "registry",
  "controller",
  "resolver",
  "universalResolver",
  "marketplace",
  "marketLens",
  "migration",
] as const;

export type V3SuiteModuleKey = (typeof V3_SUITE_MODULE_KEYS)[number];

export type V3SuiteModuleManifest = {
  address: Address | null;
  version: "3.0.0";
  abiUrl: string;
  abiSha256: string;
  runtimeCodeHash: Hex | null;
};

export type V3SuiteManifest = {
  schemaVersion: 4;
  suiteVersion: "3.0.0";
  releaseStatus: "draft" | "candidate" | "live";
  suiteReleaseId: `sha256:${string}`;
  chainId: number;
  chainName: string;
  testnet: boolean;
  requiredConfirmations: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  multicall3: { address: Address; blockCreated: number };
  suffix: string;
  suffixNode: Hex;
  reverseRootNode: Hex;
  gracePeriodSeconds: string;
  metadataBaseURI: string;
  collection: { name: string; symbol: string };
  nameRules: {
    minCodepoints: 1;
    maxCodepoints: 32;
    maxUtf8Bytes: 96;
    allowedYears: [1, 2, 3, 4, 5];
  };
  normalization: {
    profileId: string;
    profileHash: Hex;
    fixtureSha256: string;
    attestor: Address | null;
    maxAttestationValiditySeconds: string;
  };
  contracts: Record<V3SuiteModuleKey, V3SuiteModuleManifest>;
  wiring: {
    suiteConfigured: boolean;
    configureSuiteSelector: "0x3d229c48";
  };
  deployment: {
    blockNumber: string | null;
    deployedAt: string | null;
    transactionHashes: Hex[];
    owner: Address | null;
    treasury: Address | null;
  };
  settlement: {
    kind: "native" | "erc20";
    tokenAddress: Address | null;
    name: string;
    symbol: string;
    decimals: number;
  };
  pricing: {
    annualPriceBaseUnits: string;
    shortNamePriceMultipliers: [number, number, number];
    referralRewardBps: number;
    marketplaceFeeBps: number;
  };
  commitment: { minAgeSeconds: string; maxAgeSeconds: string };
  marketplace: {
    maxPageSize: 50;
    maxPageScan: 100;
    minBidIncrementBps: number;
    antiSnipingWindowSeconds: string;
    extensionDurationSeconds: string;
    maxExtensions: number;
  };
  migration: {
    legacyContract: Address;
    sourceChainId: number;
    startsAt: string | null;
    endsAt: string | null;
  };
  capabilities: {
    ensRegistryRead: true;
    ensip10: true;
    ensip15: true;
    ensip23SimpleResolve: true;
    textRecords: true;
    multicoinAddress: true;
    reverseResolution: true;
    contenthash: false;
    ccipRead: false;
    smartMulticall: false;
    fixedListings: true;
    offers: true;
    englishAuctions: true;
    paidX402: boolean;
  };
  x402: {
    protocolVersion: 2;
    scheme: "exact";
    network: `eip155:${number}`;
    paymentAsset: Address;
    assetDecimals: 6;
    paidExecutionAvailable: boolean;
  };
  endpoints: {
    docs: string;
    openApi: string;
    agentManifest: string;
    mcp: string;
    normalizationAttestation: string;
    accountApi: string;
    llms: string;
    marketApi: string;
    x402Quote: string;
    x402Registration: string;
    x402Status: string;
  };
  compiler: { solidity: string; openzeppelin: string };
  gitCommit: string | null;
};

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform((value) => getAddress(value));
const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/).transform((value) => value.toLowerCase() as Hex);
const txHash = bytes32;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const decimalUint = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const routePath = z.string().refine((value) => {
  let decoded = value;
  for (let pass = 0; pass < 4; pass += 1) {
    if (
      !decoded.startsWith("/")
      || decoded.startsWith("//")
      || decoded.includes("\\")
      || decoded.includes("..")
      || /[?#\u0000-\u001f\u007f]/.test(decoded)
    ) return false;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return true;
      decoded = next;
    } catch {
      return false;
    }
  }
  return false;
}, "Must be a safe origin-relative route.");

function mappedIpv4(host: string) {
  const normalized = host.replace(/^::ffff:/, "").replace(/^::/, "");
  const groups = normalized.split(":");
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  const upper = Number.parseInt(groups[0]!, 16);
  const lower = Number.parseInt(groups[1]!, 16);
  return [upper >> 8, upper & 255, lower >> 8, lower & 255];
}

function privateIpv4(parts: number[]) {
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 100 && (parts[1] ?? 0) >= 64 && (parts[1] ?? 0) <= 127)
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
    || (parts[0] ?? 0) >= 224;
}

export function isPrivateV3NetworkHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "::1"].includes(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8")
    || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") || host.startsWith("ff")) return true;
  if (host.startsWith("::ffff:") || /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(host)) {
    const mapped = mappedIpv4(host);
    return mapped ? privateIpv4(mapped) : true;
  }
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return privateIpv4(parts);
}

const moduleSchema = z.object({
  address: address.nullable(),
  version: z.literal("3.0.0"),
  abiUrl: routePath,
  abiSha256: sha256,
  runtimeCodeHash: bytes32.nullable(),
}).strict();

const contractsSchema = z.object(Object.fromEntries(
  V3_SUITE_MODULE_KEYS.map((key) => [key, moduleSchema]),
) as Record<V3SuiteModuleKey, typeof moduleSchema>).strict();

export const v3SuiteManifestSchema = z.object({
  schemaVersion: z.literal(4),
  suiteVersion: z.literal("3.0.0"),
  releaseStatus: z.enum(["draft", "candidate", "live"]),
  suiteReleaseId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  chainId: z.number().int().positive(),
  chainName: z.string().min(1).max(100),
  testnet: z.boolean(),
  requiredConfirmations: z.number().int().min(2).max(128),
  rpcUrl: z.string().url(),
  explorerUrl: z.string().url(),
  nativeCurrency: z.object({
    name: z.string().min(1).max(64),
    symbol: z.string().min(1).max(16),
    decimals: z.number().int().min(0).max(36),
  }).strict(),
  multicall3: z.object({ address, blockCreated: z.number().int().nonnegative() }).strict(),
  suffix: z.string().regex(/^[a-z0-9]{1,32}$/),
  suffixNode: bytes32,
  reverseRootNode: bytes32,
  gracePeriodSeconds: decimalUint,
  metadataBaseURI: z.string().url(),
  collection: z.object({ name: z.string().min(1).max(64), symbol: z.string().min(1).max(16) }).strict(),
  nameRules: z.object({
    minCodepoints: z.literal(1),
    maxCodepoints: z.literal(32),
    maxUtf8Bytes: z.literal(96),
    allowedYears: z.tuple([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }).strict(),
  normalization: z.object({
    profileId: z.string().min(1).max(200),
    profileHash: bytes32,
    fixtureSha256: sha256,
    attestor: address.nullable(),
    maxAttestationValiditySeconds: decimalUint,
  }).strict(),
  contracts: contractsSchema,
  wiring: z.object({
    suiteConfigured: z.boolean(),
    configureSuiteSelector: z.literal("0x3d229c48"),
  }).strict(),
  deployment: z.object({
    blockNumber: decimalUint.nullable(),
    deployedAt: z.string().datetime().nullable(),
    transactionHashes: z.array(txHash).max(32),
    owner: address.nullable(),
    treasury: address.nullable(),
  }).strict(),
  settlement: z.object({
    kind: z.enum(["native", "erc20"]),
    tokenAddress: address.nullable(),
    name: z.string().min(1).max(64),
    symbol: z.string().min(1).max(16),
    decimals: z.number().int().min(0).max(36),
  }).strict(),
  pricing: z.object({
    annualPriceBaseUnits: decimalUint,
    shortNamePriceMultipliers: z.tuple([
      z.number().int().min(1).max(255),
      z.number().int().min(1).max(255),
      z.number().int().min(1).max(255),
    ]),
    referralRewardBps: z.number().int().min(0).max(2_000),
    marketplaceFeeBps: z.number().int().min(0).max(500),
  }).strict(),
  commitment: z.object({ minAgeSeconds: decimalUint, maxAgeSeconds: decimalUint }).strict(),
  marketplace: z.object({
    maxPageSize: z.literal(50),
    maxPageScan: z.literal(100),
    minBidIncrementBps: z.number().int().min(1).max(5_000),
    antiSnipingWindowSeconds: decimalUint,
    extensionDurationSeconds: decimalUint,
    maxExtensions: z.number().int().min(0).max(10),
  }).strict(),
  migration: z.object({
    legacyContract: address,
    sourceChainId: z.number().int().positive(),
    startsAt: decimalUint.nullable(),
    endsAt: decimalUint.nullable(),
  }).strict(),
  capabilities: z.object({
    ensRegistryRead: z.literal(true),
    ensip10: z.literal(true),
    ensip15: z.literal(true),
    ensip23SimpleResolve: z.literal(true),
    textRecords: z.literal(true),
    multicoinAddress: z.literal(true),
    reverseResolution: z.literal(true),
    contenthash: z.literal(false),
    ccipRead: z.literal(false),
    smartMulticall: z.literal(false),
    fixedListings: z.literal(true),
    offers: z.literal(true),
    englishAuctions: z.literal(true),
    paidX402: z.boolean(),
  }).strict(),
  x402: z.object({
    protocolVersion: z.literal(2),
    scheme: z.literal("exact"),
    network: z.string().regex(/^eip155:[1-9][0-9]*$/),
    paymentAsset: address,
    assetDecimals: z.literal(6),
    paidExecutionAvailable: z.boolean(),
  }).strict(),
  endpoints: z.object({
    docs: routePath,
    openApi: routePath,
    agentManifest: routePath,
    mcp: routePath,
    normalizationAttestation: routePath,
    accountApi: routePath,
    llms: routePath,
    marketApi: routePath,
    x402Quote: routePath,
    x402Registration: routePath,
    x402Status: routePath,
  }).strict(),
  compiler: z.object({ solidity: z.string().min(1), openzeppelin: z.string().min(1) }).strict(),
  gitCommit: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
}).strict().superRefine((manifest, context) => {
  const issue = (path: Array<string | number>, message: string) => context.addIssue({
    code: "custom",
    path,
    message,
  });
  const modules = V3_SUITE_MODULE_KEYS.map((key) => manifest.contracts[key]);
  for (const [key, value] of [["rpcUrl", manifest.rpcUrl], ["explorerUrl", manifest.explorerUrl]] as const) {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || isPrivateV3NetworkHost(url.hostname)
      || (manifest.releaseStatus !== "draft" && loopback)
    ) {
      issue([key], `${key} must be a credential-free HTTPS URL.`);
    }
  }
  const deployed = modules.filter((module) => module.address !== null).length;
  if (deployed !== 0 && deployed !== V3_SUITE_MODULE_KEYS.length) {
    issue(["contracts"], "A v3 suite must publish either zero or all seven module addresses.");
  }
  const addresses = modules.flatMap((module) => module.address ? [module.address.toLowerCase()] : []);
  if (new Set(addresses).size !== addresses.length) {
    issue(["contracts"], "Every v3 suite module must use a distinct address.");
  }
  const runtimeHashes = modules.filter((module) => module.runtimeCodeHash !== null).length;
  if (runtimeHashes !== 0 && runtimeHashes !== V3_SUITE_MODULE_KEYS.length) {
    issue(["contracts"], "Runtime code hashes must be published for all seven modules together.");
  }
  const identity = [
    manifest.deployment.blockNumber,
    manifest.deployment.deployedAt,
    manifest.deployment.owner,
    manifest.deployment.treasury,
    manifest.normalization.attestor,
  ];
  if (manifest.releaseStatus === "draft") {
    if (deployed !== 0 || identity.some((value) => value !== null) || manifest.deployment.transactionHashes.length !== 0) {
      issue(["releaseStatus"], "Draft manifests cannot publish partial deployment identity or receipts.");
    }
    if (manifest.wiring.suiteConfigured || manifest.capabilities.paidX402) {
      issue(["releaseStatus"], "Draft manifests must keep wiring and paid x402 disabled.");
    }
  } else {
    if (deployed !== V3_SUITE_MODULE_KEYS.length || runtimeHashes !== V3_SUITE_MODULE_KEYS.length) {
      issue(["contracts"], "Candidate/live manifests require all addresses and runtime code hashes.");
    }
    if (identity.some((value) => value === null) || manifest.deployment.transactionHashes.length < 8) {
      issue(["deployment"], "Candidate/live manifests require deployment identity and all deployment/configuration receipts.");
    }
    if (!manifest.wiring.suiteConfigured) {
      issue(["wiring"], "Candidate/live manifests require locked suite wiring.");
    }
  }
  if (manifest.releaseStatus !== "live" && manifest.capabilities.paidX402) {
    issue(["capabilities", "paidX402"], "Paid x402 cannot be advertised before the suite is live.");
  }
  if (manifest.x402.network !== `eip155:${manifest.chainId}`) {
    issue(["x402", "network"], "x402 must use the manifest chain's CAIP-2 identifier.");
  }
  if (manifest.x402.paidExecutionAvailable !== manifest.capabilities.paidX402) {
    issue(["x402", "paidExecutionAvailable"], "x402 availability must match the capability flag.");
  }
  if (manifest.settlement.kind === "native") {
    if (manifest.settlement.tokenAddress !== null) {
      issue(["settlement", "tokenAddress"], "Native settlement cannot declare a token address.");
    }
    if (manifest.capabilities.paidX402) {
      issue(["capabilities", "paidX402"], "The reviewed paid x402 profile requires ERC-20 settlement.");
    }
  } else if (manifest.settlement.tokenAddress === null) {
    issue(["settlement", "tokenAddress"], "ERC-20 settlement requires a token address.");
  } else if (
    manifest.settlement.tokenAddress.toLowerCase() !== manifest.x402.paymentAsset.toLowerCase()
    || manifest.settlement.decimals !== manifest.x402.assetDecimals
  ) {
    issue(["x402", "paymentAsset"], "x402 asset and decimals must exactly match protocol settlement.");
  }
  const [one, two, three] = manifest.pricing.shortNamePriceMultipliers;
  if (one < two || two < three) {
    issue(["pricing", "shortNamePriceMultipliers"], "Short-name multipliers must descend.");
  }
  if (BigInt(manifest.pricing.annualPriceBaseUnits) === 0n) {
    issue(["pricing", "annualPriceBaseUnits"], "Annual price must be positive.");
  }
  const annualPrice = BigInt(manifest.pricing.annualPriceBaseUnits);
  const maximumQuote = annualPrice
    * BigInt(Math.max(...manifest.pricing.shortNamePriceMultipliers))
    * BigInt(Math.max(...manifest.nameRules.allowedYears));
  if (annualPrice > UINT256_MAX || maximumQuote > UINT256_MAX) {
    issue(["pricing", "annualPriceBaseUnits"], "Configured registration prices exceed uint256 bounds.");
  }
  const gracePeriod = BigInt(manifest.gracePeriodSeconds);
  if (gracePeriod < 86_400n || gracePeriod > 7_776_000n) {
    issue(["gracePeriodSeconds"], "Grace period must remain within the registry's 1-90 day bound.");
  }
  const metadataUrl = new URL(manifest.metadataBaseURI);
  if (
    manifest.releaseStatus !== "draft"
    && (metadataUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(metadataUrl.hostname))
  ) {
    issue(["metadataBaseURI"], "Candidate/live metadata must use a final HTTPS origin.");
  }
  if (BigInt(manifest.commitment.minAgeSeconds) >= BigInt(manifest.commitment.maxAgeSeconds)) {
    issue(["commitment"], "Commitment minimum age must be lower than maximum age.");
  }
  if (
    BigInt(manifest.commitment.minAgeSeconds) < 60n
    || BigInt(manifest.commitment.maxAgeSeconds) > 86_400n
    || BigInt(manifest.commitment.maxAgeSeconds) > UINT64_MAX
  ) {
    issue(["commitment"], "Commitment bounds must remain within the reviewed 60 second to 24 hour profile.");
  }
  if (
    BigInt(manifest.normalization.maxAttestationValiditySeconds) === 0n
    || BigInt(manifest.normalization.maxAttestationValiditySeconds) > 86_400n
  ) {
    issue(["normalization", "maxAttestationValiditySeconds"], "Attestation validity must be positive and no longer than 24 hours.");
  }
  for (const [path, value] of [
    [["gracePeriodSeconds"], manifest.gracePeriodSeconds],
    [["marketplace", "antiSnipingWindowSeconds"], manifest.marketplace.antiSnipingWindowSeconds],
    [["marketplace", "extensionDurationSeconds"], manifest.marketplace.extensionDurationSeconds],
  ] as const) {
    if (BigInt(value) > UINT64_MAX) issue([...path], "Configured value exceeds uint64 bounds.");
  }
  if (manifest.deployment.blockNumber !== null && BigInt(manifest.deployment.blockNumber) > UINT256_MAX) {
    issue(["deployment", "blockNumber"], "Deployment block exceeds uint256 bounds.");
  }
  if (
    (manifest.migration.startsAt !== null && BigInt(manifest.migration.startsAt) > UINT64_MAX)
    || (manifest.migration.endsAt !== null && BigInt(manifest.migration.endsAt) > UINT64_MAX)
  ) {
    issue(["migration"], "Migration timestamps exceed uint64 bounds.");
  }
  if (manifest.releaseStatus !== "draft" && (manifest.migration.startsAt === null || manifest.migration.endsAt === null)) {
    issue(["migration"], "Candidate/live manifests require the exact migration window.");
  } else if (
    manifest.migration.startsAt !== null
    && manifest.migration.endsAt !== null
    && BigInt(manifest.migration.startsAt) >= BigInt(manifest.migration.endsAt)
  ) {
    issue(["migration"], "Migration start must be lower than migration end.");
  }
});

export function parseV3SuiteManifest(value: unknown): V3SuiteManifest {
  const schemaVersion = typeof value === "object" && value !== null && "schemaVersion" in value
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : undefined;
  if (schemaVersion !== 4) throw new UnsupportedSchemaError(schemaVersion);
  const parsed = v3SuiteManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new ManifestMismatchError(
      `V3 suite manifest validation failed: ${parsed.error.issues[0]?.message ?? "unknown schema error"}`,
    );
  }
  return parsed.data as V3SuiteManifest;
}

export async function calculateV3SuiteReleaseId(
  manifest: Omit<V3SuiteManifest, "suiteReleaseId"> | V3SuiteManifest,
): Promise<`sha256:${string}`> {
  const { suiteReleaseId: _ignored, ...payload } = manifest as V3SuiteManifest;
  void _ignored;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function verifyV3SuiteReleaseId(manifest: V3SuiteManifest): Promise<void> {
  if (await calculateV3SuiteReleaseId(manifest) !== manifest.suiteReleaseId) {
    throw new ManifestMismatchError("V3 suite release ID does not match the canonical manifest payload.");
  }
}

export async function loadV3SuiteManifest(
  manifestUrl: string | URL,
  fetcher: typeof fetch = fetch,
): Promise<{ manifest: V3SuiteManifest; origin: URL }> {
  const url = new URL(manifestUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new ManifestMismatchError("V3 manifest URLs must use HTTPS outside loopback development.");
  }
  if (url.username || url.password) throw new ManifestMismatchError("V3 manifest URL cannot contain credentials.");
  if (isPrivateV3NetworkHost(url.hostname)) throw new ManifestMismatchError("V3 manifest URL cannot target a private network.");
  let response: Response;
  try {
    response = await fetcher(url, { redirect: "manual" });
  } catch {
    throw new SepbaseError("V3 manifest request failed.", "MANIFEST_UNAVAILABLE", 503);
  }
  assertSafeFetchResponse(response, url, "V3 suite manifest");
  if (!response.ok) {
    throw new SepbaseError(
      `V3 manifest request failed with HTTP ${response.status}.`,
      "MANIFEST_UNAVAILABLE",
      response.status,
    );
  }
  const manifest = parseV3SuiteManifest(await response.json());
  await verifyV3SuiteReleaseId(manifest);
  return { manifest, origin: url };
}
