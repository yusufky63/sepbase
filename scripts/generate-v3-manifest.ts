import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAddress, namehash } from "viem";
import {
  parseV3SuiteManifest,
  V3_SUITE_MODULE_KEYS,
  type V3SuiteManifest,
  type V3SuiteModuleKey,
} from "../packages/sdk/src/v3-manifest";
import { isMainModule } from "./lib/is-main";

const contractNames: Record<V3SuiteModuleKey, string> = {
  registry: "ChainNameRegistryV3",
  controller: "ChainNameControllerV3",
  resolver: "ChainNameResolverV3",
  universalResolver: "ChainNameUniversalResolverV3",
  marketplace: "ChainNameMarketplaceV3",
  marketLens: "ChainNameMarketLensV3",
  migration: "ChainNameMigrationV3",
};

const BASE_SEPOLIA_USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const LEGACY_V2 = getAddress("0xe000de3efe798Aa4F834fd952Bef35BAE1B16945");
const NORMALIZATION_PROFILE = "ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47";
const NORMALIZATION_PROFILE_HASH =
  "0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638" as const;
const ADDR_REVERSE_NODE =
  "0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2" as const;

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalReleasePayload(manifest: Omit<V3SuiteManifest, "suiteReleaseId">) {
  return JSON.stringify(manifest);
}

export async function generateV3DraftManifest() {
  const root = process.cwd();
  const fixtureBytes = await readFile(resolve(root, "fixtures/name-normalization.json"));
  const contracts = {} as V3SuiteManifest["contracts"];

  for (const key of V3_SUITE_MODULE_KEYS) {
    const contract = contractNames[key];
    const abiPath = resolve(root, `apps/web/public/abi/v3/${contract}.json`);
    const abiBytes = await readFile(abiPath);
    contracts[key] = {
      address: null,
      version: "3.0.0",
      abiUrl: `/abi/v3/${contract}.json`,
      abiSha256: sha256(abiBytes),
      runtimeCodeHash: null,
    };
  }

  const configuredOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sepbase.vercel.app").replace(/\/$/, "");
  const siteUrl = new URL(configuredOrigin);
  if (siteUrl.protocol !== "https:" || siteUrl.username || siteUrl.password || siteUrl.pathname !== "/") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a credential-free HTTPS origin.");
  }

  const payload: Omit<V3SuiteManifest, "suiteReleaseId"> = {
    schemaVersion: 4,
    suiteVersion: "3.0.0",
    releaseStatus: "draft",
    chainId: 84_532,
    chainName: "Base Sepolia",
    testnet: true,
    requiredConfirmations: 5,
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://base-sepolia.blockscout.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    multicall3: {
      address: getAddress("0xca11bde05977b3631167028862be2a173976ca11"),
      blockCreated: 1_059_647,
    },
    suffix: "sepbase",
    suffixNode: namehash("sepbase"),
    reverseRootNode: ADDR_REVERSE_NODE,
    gracePeriodSeconds: "2592000",
    metadataBaseURI: `${configuredOrigin}/api/metadata/`,
    collection: { name: "Sepbase Names V3", symbol: "SEPBASE" },
    nameRules: {
      minCodepoints: 1,
      maxCodepoints: 32,
      maxUtf8Bytes: 96,
      allowedYears: [1, 2, 3, 4, 5],
    },
    normalization: {
      profileId: NORMALIZATION_PROFILE,
      profileHash: NORMALIZATION_PROFILE_HASH,
      fixtureSha256: sha256(fixtureBytes),
      attestor: null,
      maxAttestationValiditySeconds: "900",
    },
    contracts,
    wiring: { suiteConfigured: false, configureSuiteSelector: "0x3d229c48" },
    deployment: {
      blockNumber: null,
      deployedAt: null,
      transactionHashes: [],
      owner: null,
      treasury: null,
    },
    settlement: {
      kind: "erc20",
      tokenAddress: BASE_SEPOLIA_USDC,
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
    },
    pricing: {
      // Testnet units only. This field is not a fiat price claim.
      annualPriceBaseUnits: "500",
      shortNamePriceMultipliers: [100, 25, 5],
      referralRewardBps: 1_000,
      marketplaceFeeBps: 0,
    },
    commitment: { minAgeSeconds: "60", maxAgeSeconds: "86400" },
    marketplace: {
      maxPageSize: 50,
      maxPageScan: 100,
      minBidIncrementBps: 500,
      antiSnipingWindowSeconds: "300",
      extensionDurationSeconds: "300",
      maxExtensions: 6,
    },
    migration: {
      legacyContract: LEGACY_V2,
      sourceChainId: 84_532,
      startsAt: null,
      endsAt: null,
    },
    capabilities: {
      ensRegistryRead: true,
      ensip10: true,
      ensip15: true,
      ensip23SimpleResolve: true,
      textRecords: true,
      multicoinAddress: true,
      reverseResolution: true,
      contenthash: false,
      ccipRead: false,
      smartMulticall: false,
      fixedListings: true,
      offers: true,
      englishAuctions: true,
      paidX402: false,
    },
    x402: {
      protocolVersion: 2,
      scheme: "exact",
      network: "eip155:84532",
      paymentAsset: BASE_SEPOLIA_USDC,
      assetDecimals: 6,
      paidExecutionAvailable: false,
    },
    endpoints: {
      docs: "/developers",
      openApi: "/api/openapi.json",
      agentManifest: "/.well-known/chain-name-agent.json",
      mcp: "/api/v3/mcp",
      normalizationAttestation: "/api/v3/normalization-attestation",
      accountApi: "/api/v3/account/{address}",
      llms: "/llms.txt",
      marketApi: "/api/v3/market",
      x402Quote: "/api/x402/registration/quote",
      x402Registration: "/api/x402/registration",
      x402Status: "/api/x402/registration/status",
    },
    compiler: { solidity: "0.8.36", openzeppelin: "5.4.0" },
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.match(/^[a-f0-9]{40}$/)?.[0] ?? null,
  };

  const manifest = parseV3SuiteManifest({
    ...payload,
    suiteReleaseId: `sha256:${sha256(canonicalReleasePayload(payload))}`,
  });
  const output = resolve(root, "apps/web/public/deployment-manifest.v3.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { output, manifest };
}

if (isMainModule(import.meta.url)) {
  const { output, manifest } = await generateV3DraftManifest();
  console.log(`Generated ${manifest.releaseStatus} v3 suite manifest at ${output}.`);
}
