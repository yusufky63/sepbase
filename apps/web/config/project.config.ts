import { projectConfigSchema } from "./project-config.schema";

const projectAdminViewerAddresses = [
  "0xEAa823AB4C4eE00283d8ed7be713ddf8A5ba0Fac",
  ...(process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? "").split(","),
]
  .map((value) => value.trim())
  .filter((value, index, values) => value.length > 0
    && values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);

export const projectConfig = projectConfigSchema.parse({
  brand: {
    name: "SEPBASE",
    shortName: "SEP/BASE",
    suffix: "sepbase",
    motto: "Your Base Sepolia name, clearly onchain.",
    description:
      "Independent, readable wallet names registered and resolved directly on Base Sepolia.",
    theme: "contrast",
    accent: "#0000ff",
    logo: "/brand/logo.svg",
    mark: "/brand/mark.svg",
    favicon: "/brand/favicon.svg",
  },
  collection: {
    name: "Sepbase Names",
    symbol: "SEPBASE",
  },
  chain: {
    id: 84532,
    name: "Base Sepolia",
    testnet: true,
    requiredConfirmations: 1,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org",
    explorerUrl: "https://sepolia-explorer.base.org",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    feeEstimation: {
      kind: "op-stack",
      gasPriceOracleAddress: "0x420000000000000000000000000000000000000F",
      l1BlockAddress: "0x4200000000000000000000000000000000000015",
    },
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 1_059_647,
    },
  },
  settlement: {
    kind: "native",
    tokenAddress: null,
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  names: {
    minLength: 1,
    maxLength: 32,
    allowedYears: [1, 2, 3, 4, 5],
    gracePeriodDays: 30,
  },
  pricing: {
    annual: "0.0005",
    shortNameMultipliers: [100, 25, 5],
    referenceFiat: null,
    marketReference: {
      provider: "coinbase",
      asset: "ETH",
      currency: "USD",
      cacheSeconds: 60,
    },
  },
  referrals: {
    rewardBps: 1000,
    attributionDays: 30,
  },
  marketplace: {
    feeBps: 0,
    listingsPerPage: 24,
  },
  admin: {
    path: "/admin",
    viewerAddresses: projectAdminViewerAddresses,
    logBlockRange: 2_000,
    activityPageSize: 25,
  },
  integration: {
    docsPath: "/developers",
    metadataPath: "/api/metadata/",
    imagePath: "/api/image/",
    nameApiPath: "/api/name/{label}",
    resolveApiPath: "/api/resolve/{label}",
    reverseApiPath: "/api/reverse/{address}",
    wellKnownPath: "/.well-known/chain-name-service.json",
    marketApiPath: "/api/market",
    openApiPath: "/api/openapi.json",
    agentManifestPath: "/.well-known/chain-name-agent.json",
    mcpPath: "/api/mcp",
    x402QuotePath: "/api/x402/registration/quote",
    x402RegisterPath: "/api/x402/registration",
  },
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  links: {
    website: "",
    x: "",
    discord: "",
  },
});
