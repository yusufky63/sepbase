export const projectConfig = {
  brand: {
    name: 'Chain Name',
    shortName: 'Chain Name',
    suffix: 'example',
    motto: 'Name your place onchain.',
    description: 'A readable identity on Base Sepolia.',
    theme: 'contrast' as const,
    accent: '#0000ff',
    logo: '/brand/logo.svg',
    mark: '/brand/mark.svg',
    favicon: '/brand/favicon.svg',
  },

  collection: {
    name: 'Chain Name',
    symbol: 'CNAME',
  },

  chain: {
    id: 84532,
    name: 'Base Sepolia',
    testnet: true,
    requiredConfirmations: 1,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
    explorerUrl: 'https://sepolia-explorer.base.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    feeEstimation: {
      kind: 'op-stack' as const,
      gasPriceOracleAddress: '0x420000000000000000000000000000000000000F',
      l1BlockAddress: '0x4200000000000000000000000000000000000015',
    },
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11',
      blockCreated: 1_059_647,
    },
  },

  settlement: {
    kind: 'native' as const,
    tokenAddress: null,
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  names: {
    minLength: 1,
    maxLength: 32,
    allowedYears: [1, 2, 3, 4, 5] as const,
    gracePeriodDays: 30,
  },

  pricing: {
    // Standard annual rate for 4-32 characters; short labels apply the tuple below.
    annual: '0.0005',
    shortNameMultipliers: [100, 25, 5] as const,
    referenceFiat: null,
    // Optional UI-only spot reference; never enters protocol pricing or write guards.
    marketReference: null,
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
    path: '/admin',
    viewerAddresses: (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    logBlockRange: 2_000,
    activityPageSize: 25,
  },

  integration: {
    docsPath: '/developers',
    metadataPath: '/api/metadata/',
    imagePath: '/api/image/',
    nameApiPath: '/api/name/{label}',
    resolveApiPath: '/api/resolve/{label}',
    reverseApiPath: '/api/reverse/{address}',
    wellKnownPath: '/.well-known/chain-name-service.json',
    marketApiPath: '/api/market',
    openApiPath: '/api/openapi.json',
    agentManifestPath: '/.well-known/chain-name-agent.json',
    mcpPath: '/api/mcp',
    x402QuotePath: '/api/x402/registration/quote',
    x402RegisterPath: '/api/x402/registration',
  },

  siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,

  links: {
    website: '',
    x: '',
    discord: '',
  },
} as const;
