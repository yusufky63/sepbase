import { namehash } from "viem";
import { describe, expect, it } from "vitest";
import { ManifestMismatchError } from "./errors";
import { assertV3DeploymentConfirmation } from "./v3-contract";
import {
  calculateV3SuiteReleaseId,
  loadV3SuiteManifest,
  parseV3SuiteManifest,
  V3_SUITE_MODULE_KEYS,
  verifyV3SuiteReleaseId,
  type V3SuiteManifest,
} from "./v3-manifest";

const digest = "a".repeat(64);
const testUsdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const legacy = "0xe000de3efe798Aa4F834fd952Bef35BAE1B16945";

function draftManifest(): V3SuiteManifest {
  const contracts = Object.fromEntries(V3_SUITE_MODULE_KEYS.map((key) => [key, {
    address: null,
    version: "3.0.0",
    abiUrl: `/abi/v3/${key}.json`,
    abiSha256: digest,
    runtimeCodeHash: null,
  }])) as V3SuiteManifest["contracts"];
  return {
    schemaVersion: 4,
    suiteVersion: "3.0.0",
    releaseStatus: "draft",
    suiteReleaseId: `sha256:${digest}`,
    chainId: 84_532,
    chainName: "Base Sepolia",
    testnet: true,
    requiredConfirmations: 5,
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://base-sepolia.blockscout.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11", blockCreated: 1_059_647 },
    suffix: "sepbase",
    suffixNode: namehash("sepbase"),
    reverseRootNode: "0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2",
    gracePeriodSeconds: "2592000",
    metadataBaseURI: "https://sepbase.vercel.app/api/metadata/",
    collection: { name: "Sepbase Names V3", symbol: "SEPBASE" },
    nameRules: { minCodepoints: 1, maxCodepoints: 32, maxUtf8Bytes: 96, allowedYears: [1, 2, 3, 4, 5] },
    normalization: {
      profileId: "ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47",
      profileHash: "0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638",
      fixtureSha256: "d912fe8e376a22b9e67483afc2fa8fac2cc42244ca4993046843d6693d8c7e49",
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
      tokenAddress: testUsdc,
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
    },
    pricing: {
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
    migration: { legacyContract: legacy, sourceChainId: 84_532, startsAt: null, endsAt: null },
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
      paymentAsset: testUsdc,
      assetDecimals: 6,
      paidExecutionAvailable: false,
    },
    endpoints: {
      docs: "/developers",
      openApi: "/api/openapi.json",
      agentManifest: "/.well-known/chain-name-agent.json",
      mcp: "/api/mcp",
      normalizationAttestation: "/api/v3/normalization-attestation",
      accountApi: "/api/v3/account/{address}",
      llms: "/llms.txt",
      marketApi: "/api/market",
      x402Quote: "/api/x402/registration/quote",
      x402Registration: "/api/x402/registration",
      x402Status: "/api/x402/registration/status",
    },
    compiler: { solidity: "0.8.36", openzeppelin: "5.4.0" },
    gitCommit: null,
  };
}

describe("v3 suite manifest", () => {
  it("accepts an explicit seven-module draft without fake deployment addresses", () => {
    const parsed = parseV3SuiteManifest(draftManifest());
    expect(Object.keys(parsed.contracts)).toEqual(V3_SUITE_MODULE_KEYS);
    expect(parsed.releaseStatus).toBe("draft");
  });

  it("rejects partial module publication", () => {
    const manifest = draftManifest();
    manifest.contracts.registry.address = "0x1111111111111111111111111111111111111111";
    expect(() => parseV3SuiteManifest(manifest)).toThrow(/zero or all seven/i);
  });

  it("rejects paid execution claims on a draft", () => {
    const manifest = draftManifest();
    manifest.capabilities.paidX402 = true;
    manifest.x402.paidExecutionAvailable = true;
    expect(() => parseV3SuiteManifest(manifest)).toThrow(/draft manifests/i);
  });

  it("rejects settlement and x402 asset drift", () => {
    const manifest = draftManifest();
    manifest.x402.paymentAsset = "0x1111111111111111111111111111111111111111";
    expect(() => parseV3SuiteManifest(manifest)).toThrow(/exactly match/i);
  });

  it("enforces a mainnet-like confirmation floor", () => {
    const manifest = draftManifest();
    manifest.requiredConfirmations = 1;
    expect(() => parseV3SuiteManifest(manifest)).toThrow(ManifestMismatchError);
  });

  it("detects any payload drift through the suite release ID", async () => {
    const manifest = draftManifest();
    manifest.suiteReleaseId = await calculateV3SuiteReleaseId(manifest);
    await expect(verifyV3SuiteReleaseId(manifest)).resolves.toBeUndefined();
    manifest.pricing.annualPriceBaseUnits = "501";
    await expect(verifyV3SuiteReleaseId(manifest)).rejects.toThrow(/release ID/i);
  });

  it("rejects private-network and IPv4-mapped manifest targets before fetch", async () => {
    const fetcher = async () => {
      throw new Error("must not fetch");
    };
    await expect(loadV3SuiteManifest(
      "https://[::ffff:127.0.0.1]/deployment-manifest.v3.json",
      fetcher,
    )).rejects.toThrow(/private network/i);
    await expect(loadV3SuiteManifest(
      "https://metadata.service.internal/deployment-manifest.v3.json",
      fetcher,
    )).rejects.toThrow(/private network/i);

    const privateRpc = draftManifest();
    privateRpc.rpcUrl = "https://10.0.0.1/rpc";
    expect(() => parseV3SuiteManifest(privateRpc)).toThrow(/credential-free HTTPS/i);
  });

  it("rejects manifest redirects instead of following them", async () => {
    await expect(loadV3SuiteManifest(
      "https://names.example/deployment-manifest.v3.json",
      async () => new Response(null, { status: 302, headers: { location: "https://evil.example" } }),
    )).rejects.toThrow(/redirect/i);
  });

  it("rejects values that overflow contract integer and price bounds", () => {
    const priceOverflow = draftManifest();
    priceOverflow.pricing.annualPriceBaseUnits = ((1n << 256n) - 1n).toString();
    expect(() => parseV3SuiteManifest(priceOverflow)).toThrow(/uint256/i);

    const timestampOverflow = draftManifest();
    timestampOverflow.migration.startsAt = (1n << 64n).toString();
    timestampOverflow.migration.endsAt = ((1n << 64n) + 1n).toString();
    expect(() => parseV3SuiteManifest(timestampOverflow)).toThrow(/uint64/i);
  });

  it("requires the declared deployment confirmation floor at one pinned block", () => {
    const manifest = draftManifest();
    manifest.deployment.blockNumber = "100";
    manifest.multicall3.blockCreated = 1;
    expect(() => assertV3DeploymentConfirmation(manifest, 103n)).toThrow(/confirmation floor/i);
    expect(assertV3DeploymentConfirmation(manifest, 104n)).toBe(100n);
  });
});
