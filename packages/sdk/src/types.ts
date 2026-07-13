import type { Address } from "viem";

export type SettlementMetadata = {
  kind: "native" | "erc20";
  tokenAddress: Address | null;
  name: string;
  symbol: string;
  decimals: number;
};

export type NameLifecycle = "unregistered" | "active" | "grace" | "released";

export type NameProfile = {
  displayName: string;
  bio: string;
  avatar: string;
  website: string;
  twitter: string;
  github: string;
};

export type NameState = {
  lifecycle: NameLifecycle;
  reserved: boolean;
  available: boolean;
  registrationsPaused: boolean;
  solvent: boolean;
  canRegister: boolean;
  blockNumber: bigint;
};

export type IdentityVerificationReason =
  | "verified"
  | "no-primary-name"
  | "invalid-primary-name"
  | "inactive-name"
  | "name-mismatch"
  | "owner-mismatch"
  | "resolution-mismatch"
  | "expected-address-mismatch";

export type VerifiedAddressIdentity = {
  account: Address;
  primaryName: string | null;
  label: string | null;
  tokenId: bigint | null;
  lifecycle: NameLifecycle;
  owner: Address | null;
  resolvedAddress: Address | null;
  expiresAt: bigint | null;
  verified: boolean;
  reason: IdentityVerificationReason;
  blockNumber: bigint;
};

export type VerifiedNameResolution = {
  label: string;
  fullName: string;
  tokenId: bigint;
  lifecycle: NameLifecycle;
  owner: Address | null;
  resolvedAddress: Address | null;
  primaryName: string | null;
  expectedAddress: Address | null;
  expiresAt: bigint | null;
  verified: boolean;
  reason: IdentityVerificationReason;
  blockNumber: bigint;
};

export type ProtocolHealth = {
  settlementBalance: bigint;
  protectedLiability: bigint;
  solvent: boolean;
  blockNumber: bigint;
};

export type ActiveMarketListing = {
  tokenId: bigint;
  label: string;
  fullName: string;
  seller: Address;
  price: bigint;
  feeBps: number;
  listedAt: bigint;
  expiresAt: bigint;
  purchasable: boolean;
};

export type ActiveMarketPage = {
  items: ActiveMarketListing[];
  marketplacePaused: boolean;
  solvent: boolean;
  blockNumber: bigint;
  nextCursor: bigint | null;
  hasMore: boolean;
  scanned: number;
};

export type ChainNameManifest = {
  schemaVersion: 3;
  contractVersion: "2.0.0";
  abiSha256: string | null;
  chainId: number;
  chainName: string;
  testnet: boolean;
  requiredConfirmations: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  multicall3: { address: Address; blockCreated: number };
  suffix: string;
  nameRules: { minLength: number; maxLength: number; allowedYears: number[] };
  collection: { name: string; symbol: string };
  contract: Address | null;
  deploymentBlock: string | null;
  deployedAt: string | null;
  owner: Address | null;
  treasury: Address | null;
  settlement: SettlementMetadata;
  annualPriceBaseUnits: string;
  shortNamePriceMultipliers: [number, number, number];
  referenceFiat: { currency: string; amount: string; asOf: string; maxAgeDays: number } | null;
  gracePeriodSeconds: string;
  referralRewardBps: number;
  referralAttributionSeconds: string;
  marketplaceFeeBps: number;
  metadataBaseURI: string;
  rpcUrl: string;
  explorerUrl: string;
  abiUrl: string;
  docsUrl: string;
  nameApiUrl: string;
  resolveApiUrl: string;
  reverseApiUrl: string;
  marketApiUrl: string;
  openApiUrl: string;
  solidityVersion: string;
  openzeppelinVersion: string;
  gitCommit: string | null;
};

export type ApiErrorEnvelope = {
  error: { code: string; message: string };
};

export type ApiContext = {
  contractVersion: "2.0.0";
  chainId: number;
  chainName: string;
  contract: Address | null;
  suffix: string;
  nameRules: ChainNameManifest["nameRules"];
  settlement: SettlementMetadata;
  pricing: {
    standardAnnualPriceBaseUnits: string;
    shortNamePriceMultipliers: [number, number, number];
    referenceFiat: ChainNameManifest["referenceFiat"];
  };
};

export type ResolveResponse = {
  data: {
    label: string;
    fullName: string;
    resolvedAddress: Address | null;
    owner: Address;
    expiresAt: string | null;
    status: "ACTIVE" | "GRACE";
    profile: NameProfile;
    blockNumber: string;
  };
  context: ApiContext;
};

export type ReverseResponse = {
  data: {
    address: Address;
    primaryName: string | null;
    label: string | null;
    owner: Address | null;
    resolvedAddress: Address | null;
    expiresAt: string | null;
    status: "ACTIVE" | "GRACE" | null;
    ownerConfirmed: boolean;
    forwardConfirmed: boolean;
    verified: boolean;
    blockNumber: string;
  };
  context: ApiContext;
};

export type MarketListing = {
  tokenId: string;
  label: string;
  fullName: string;
  seller: Address;
  priceBaseUnits: string;
  feeBps: number;
  listedAt: string;
  expiresAt: string;
  purchasable: boolean;
};

export type MarketResponse = {
  items: MarketListing[];
  marketplacePaused: boolean;
  solvent: boolean;
  blockNumber: string;
  nextCursor: string | null;
  hasMore: boolean;
  scanned: number;
  context: ApiContext;
};
