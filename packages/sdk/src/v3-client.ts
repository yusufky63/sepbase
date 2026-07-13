import {
  encodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  isAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hash,
  type Hex,
  zeroAddress,
} from "viem";
import {
  chainNameControllerV3Abi,
  chainNameMarketLensV3Abi,
  chainNameMarketplaceV3Abi,
  chainNameMigrationV3Abi,
  chainNameRegistryV3Abi,
  chainNameResolverV3Abi,
} from "./v3-abi.generated.js";
import {
  assertV3VerificationBlock,
  createV3SuiteContext,
  type V3SuiteContext,
} from "./v3-contract.js";
import { InvalidInputError, ManifestMismatchError, NotDeployedError, RpcUnavailableError, SepbaseError } from "./errors.js";
import { assertCanonicalLabel, normalizeName, type NormalizedName } from "./normalization.js";
import { verifyV3SuiteReleaseId, V3_SUITE_MODULE_KEYS } from "./v3-manifest.js";

const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const MAX_INITIAL_TEXT_RECORDS = 10;
const MAX_TEXT_KEY_BYTES = 64;
const MAX_TEXT_VALUE_BYTES = 512;
const MAX_LISTING_DURATION = 180n * 86_400n;
const MAX_OFFER_DURATION = 30n * 86_400n;
const MAX_AUCTION_DURATION = 30n * 86_400n;
const MAX_AUCTION_START_DELAY = 7n * 86_400n;
const erc20ApprovalAbi = parseAbi(["function approve(address spender,uint256 amount) returns (bool)"]);
const legacyV2MigrationAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function statusOf(uint256 tokenId) view returns (uint8)",
  "function expiresAt(uint256 tokenId) view returns (uint64)",
  "function resolvedAddress(uint256 tokenId) view returns (address)",
]);

/**
 * Migration is deliberately narrower than public ENSIP-15 registration. A v2
 * label must already be the exact historical lowercase ASCII label; migration
 * callers may not use normalization to transform a different raw input into an
 * eligible legacy identity.
 */
export function assertLegacyV2MigrationLabel(input: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input) || input.length > 32) {
    throw new InvalidInputError(
      "Legacy migration labels must be the exact 1-32 character lowercase ASCII v2 label with only single interior hyphens.",
    );
  }
  return input;
}

export type V3ResolverInitialization = {
  addressRecord: Address;
  textRecords?: readonly { key: string; value: string }[];
};

export type V3NormalizationAttestation = {
  validUntil: bigint;
  signature: Hex;
};

export type V3SettlementApprovalPlan = {
  token: Address;
  spender: Address;
  amount: bigint;
  data: Hex;
};

export type V3TransactionPlan = {
  suiteReleaseId: `sha256:${string}`;
  chainId: number;
  expectedSender: Address;
  to: Address;
  data: Hex;
  value: bigint;
  functionName: string;
  blockNumber: bigint;
  settlementApproval: V3SettlementApprovalPlan | null;
};

export type V3RegistrationScope = {
  suiteReleaseId: `sha256:${string}`;
  chainId: number;
  controller: Address;
  preparedAtBlock: bigint;
  label: string;
  node: Hex;
  payer: Address;
  recipient: Address;
  durationYears: 1 | 2 | 3 | 4 | 5;
  referrer: Address;
  expectedAmount: bigint;
  expectedReferralRewardBps: number;
  resolverInitializationHash: Hex;
  normalizationAttestationHash: Hex;
  normalizationTypedDataDigest: Hex;
  commitment: Hex;
};

export type V3AddressVerificationReason =
  | "no-primary"
  | "invalid-primary"
  | "inactive"
  | "owner-mismatch"
  | "forward-mismatch";

export type V3AddressVerification = {
  address: Address;
  name: string | null;
  verified: boolean;
  reason: V3AddressVerificationReason | null;
  blockNumber: bigint;
};

export type V3Listing = {
  tokenId: bigint;
  seller: Address;
  price: bigint;
  deadline: bigint;
  transferNonce: bigint;
  listingNonce: bigint;
  feeBps: number;
};

export type V3OfferState = "none" | "active" | "refunded" | "accepted";

export type V3Offer = {
  offerId: Hex;
  tokenId: bigint;
  buyer: Address;
  recipient: Address;
  ownerSnapshot: Address;
  amount: bigint;
  deadline: bigint;
  transferNonce: bigint;
  feeBps: number;
  state: V3OfferState;
  stale: boolean;
};

export type V3Auction = {
  tokenId: bigint;
  seller: Address;
  highestBidder: Address;
  highestBidRecipient: Address;
  reservePrice: bigint;
  highestBid: bigint;
  startAt: bigint;
  endAt: bigint;
  hardEndAt: bigint;
  transferNonce: bigint;
  auctionNonce: bigint;
  feeBps: number;
  extensionsUsed: number;
};

export type V3Liabilities = {
  controllerProtectedBalance: bigint;
  referralLiability: bigint;
  marketplaceProtectedBalance: bigint;
  claimableLiability: bigint;
  offerEscrow: bigint;
  auctionEscrow: bigint;
  suiteProtectedBalance: bigint;
  suiteSettlementBalance: bigint;
  controllerSolvent: boolean;
  marketplaceSolvent: boolean;
  suiteSolvent: boolean;
  blockNumber: bigint;
};

export type V3NameRecord = {
  label: string;
  fullName: string;
  node: Hex;
  tokenId: bigint;
  status: "unregistered" | "active" | "grace" | "released";
  owner: Address | null;
  resolvedAddress: Address | null;
  expiresAt: bigint | null;
  available: boolean;
  reserved: boolean;
  transferNonce: bigint;
  blockNumber: bigint;
};

export type V3OwnedNamePage = {
  items: V3NameRecord[];
  total: bigint;
  nextCursor: bigint;
  blockNumber: bigint;
};

export type V3AccountBalances = {
  account: Address;
  referralRewards: bigint;
  marketplaceClaimable: bigint;
  primary: V3AddressVerification;
  blockNumber: bigint;
};

export type V3MigrationEligibility = {
  account: Address;
  label: string;
  tokenId: bigint;
  blockNumber: bigint;
  blockTimestamp: bigint;
  sourceChainId: bigint;
  legacyRegistry: Address;
  migrationStartsAt: bigint;
  migrationEndsAt: bigint;
  phase: "not-started" | "open" | "paused" | "closed";
  legacyStatus: "unregistered" | "active" | "grace" | "released";
  legacyOwner: Address | null;
  legacyExpiresAt: bigint;
  legacyResolution: Address;
  reserved: boolean;
  eligible: boolean;
  reason: "not-started" | "paused" | "closed" | "unregistered" | "released" | "owner-mismatch" | null;
};

export type SepbaseV3Client = V3SuiteContext & {
  normalize(input: string): NormalizedName;
  quoteRegistration(label: string, durationYears: 1 | 2 | 3 | 4 | 5, blockNumber?: bigint): Promise<bigint>;
  prepareRegistrationCommit(input: {
    label: string;
    payer: Address;
    recipient: Address;
    durationYears: 1 | 2 | 3 | 4 | 5;
    referrer?: Address | null;
    secret: Hex;
    initialization: V3ResolverInitialization;
    attestation: V3NormalizationAttestation;
  }): Promise<{ scope: V3RegistrationScope; plan: V3TransactionPlan }>;
  prepareRegistrationReveal(input: {
    scope: V3RegistrationScope;
    secret: Hex;
    initialization: V3ResolverInitialization;
    attestation: V3NormalizationAttestation;
  }): Promise<{ plan: V3TransactionPlan; earliestRevealAt: bigint; latestRevealAt: bigint }>;
  prepareRenew(input: {
    owner: Address;
    tokenId: bigint;
    durationYears: 1 | 2 | 3 | 4 | 5;
  }): Promise<V3TransactionPlan>;
  resolveAddress(label: string, blockNumber?: bigint): Promise<Address | null>;
  resolveText(label: string, key: string, blockNumber?: bigint): Promise<string>;
  reverseResolve(account: Address, blockNumber?: bigint): Promise<{ name: string | null; verified: boolean }>;
  verifyAddress(account: Address, blockNumber?: bigint): Promise<V3AddressVerification>;
  getNameRecord(label: string, blockNumber?: bigint): Promise<V3NameRecord>;
  getOwnedNames(account: Address, cursor?: bigint, limit?: number, blockNumber?: bigint): Promise<V3OwnedNamePage>;
  getAccountBalances(account: Address, blockNumber?: bigint): Promise<V3AccountBalances>;
  getMigrationEligibility(input: {
    account: Address;
    legacyLabel: string;
  }, blockNumber?: bigint): Promise<V3MigrationEligibility>;
  getListings(cursor?: bigint, limit?: number, blockNumber?: bigint): Promise<{ items: V3Listing[]; nextCursor: bigint; blockNumber: bigint }>;
  getGlobalOffers(cursor?: bigint, limit?: number, includeTerminal?: boolean, blockNumber?: bigint): Promise<{ items: V3Offer[]; nextCursor: bigint; blockNumber: bigint }>;
  getBuyerOffers(buyer: Address, cursor?: bigint, limit?: number, includeTerminal?: boolean, blockNumber?: bigint): Promise<{ items: V3Offer[]; nextCursor: bigint; blockNumber: bigint }>;
  getOwnerOffers(owner: Address, cursor?: bigint, limit?: number, includeTerminal?: boolean, blockNumber?: bigint): Promise<{ items: V3Offer[]; nextCursor: bigint; blockNumber: bigint }>;
  getAuctions(cursor?: bigint, limit?: number, blockNumber?: bigint): Promise<{ items: V3Auction[]; nextCursor: bigint; blockNumber: bigint }>;
  prepareMarketplaceApproval(input: { owner: Address; tokenId: bigint }): Promise<V3TransactionPlan>;
  prepareList(input: { seller: Address; tokenId: bigint; price: bigint; deadline: bigint }): Promise<V3TransactionPlan>;
  prepareUpdateListing(input: { seller: Address; tokenId: bigint; newPrice: bigint; newDeadline: bigint }): Promise<V3TransactionPlan>;
  prepareCancelListing(input: { seller: Address; tokenId: bigint }): Promise<V3TransactionPlan>;
  prepareInvalidateListing(input: { caller: Address; tokenId: bigint }): Promise<V3TransactionPlan>;
  prepareBuy(input: { buyer: Address; tokenId: bigint; recipient?: Address }): Promise<V3TransactionPlan>;
  prepareOffer(input: { buyer: Address; tokenId: bigint; recipient?: Address; amount: bigint; deadline: bigint }): Promise<V3TransactionPlan>;
  prepareAcceptOffer(input: { seller: Address; offerId: Hex }): Promise<V3TransactionPlan>;
  prepareCancelOffer(input: { buyer: Address; offerId: Hex }): Promise<V3TransactionPlan>;
  prepareInvalidateOffer(input: { caller: Address; offerId: Hex }): Promise<V3TransactionPlan>;
  prepareStartAuction(input: { seller: Address; tokenId: bigint; reservePrice: bigint; startAt: bigint; endAt: bigint }): Promise<V3TransactionPlan>;
  prepareCancelAuction(input: { seller: Address; tokenId: bigint }): Promise<V3TransactionPlan>;
  prepareBid(input: { bidder: Address; tokenId: bigint; recipient?: Address; amount: bigint }): Promise<V3TransactionPlan>;
  prepareFinalizeAuction(input: { caller: Address; tokenId: bigint }): Promise<V3TransactionPlan>;
  prepareMarketplaceClaim(input: { account: Address; recipient?: Address }): Promise<V3TransactionPlan>;
  prepareReferralClaim(input: { account: Address; recipient?: Address }): Promise<V3TransactionPlan>;
  prepareSetText(input: { owner: Address; label: string; key: string; value: string }): Promise<V3TransactionPlan>;
  prepareSetAddress(input: { owner: Address; label: string; target: Address }): Promise<V3TransactionPlan>;
  prepareSetPrimary(input: { owner: Address; tokenId: bigint }): Promise<V3TransactionPlan>;
  prepareClearPrimary(input: { owner: Address }): Promise<V3TransactionPlan>;
  prepareTransfer(input: { owner: Address; recipient: Address; tokenId: bigint; safe?: boolean }): Promise<V3TransactionPlan>;
  prepareMigrationClaim(input: {
    caller: Address;
    legacyLabel: string;
    recipient: Address;
    expectedLegacyOwner: Address;
    importLegacyResolution: boolean;
    expectedLegacyResolution?: Address | null;
  }): Promise<V3TransactionPlan>;
  getLiabilities(blockNumber?: bigint): Promise<V3Liabilities>;
  assertTransactionPlan(plan: V3TransactionPlan): void;
  reconcileTransaction(plan: V3TransactionPlan, hash: Hash): Promise<{ hash: Hash; blockNumber: bigint; status: "success" }>;
};

function validAddress(value: string, label: string, allowZero = false): Address {
  if (!isAddress(value)) throw new InvalidInputError(`${label} is not a valid EVM address.`);
  const address = getAddress(value);
  if (!allowZero && address === zeroAddress) throw new InvalidInputError(`${label} cannot be zero.`);
  return address;
}

function validAmount(value: bigint, label: string) {
  if (value <= 0n || value > UINT256_MAX) throw new InvalidInputError(`${label} must be a positive uint256.`);
  return value;
}

function validUint256(value: bigint, label: string) {
  if (value < 0n || value > UINT256_MAX) throw new InvalidInputError(`${label} exceeds uint256.`);
  return value;
}

function validUint64(value: bigint, label: string) {
  if (value < 0n || value > UINT64_MAX) throw new InvalidInputError(`${label} exceeds uint64.`);
  return value;
}

function validBytes32(value: Hex, label: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new InvalidInputError(`${label} must be bytes32.`);
  return value.toLowerCase() as Hex;
}

function validSignature(value: Hex) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(value)) {
    throw new InvalidInputError("Normalization signature must be a 65-byte ECDSA signature.");
  }
  return value;
}

function textBytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeInitialization(input: V3ResolverInitialization) {
  const addressRecord = validAddress(input.addressRecord, "Resolver address record", true);
  const records = input.textRecords ?? [];
  if (records.length > MAX_INITIAL_TEXT_RECORDS) throw new InvalidInputError("Too many initial text records.");
  const textKeys: string[] = [];
  const textValues: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (!record.key || textBytes(record.key) > MAX_TEXT_KEY_BYTES) throw new InvalidInputError("Text record key is invalid.");
    if (textBytes(record.value) > MAX_TEXT_VALUE_BYTES) throw new InvalidInputError("Text record value is too long.");
    if (seen.has(record.key)) throw new InvalidInputError("Duplicate initial text record key.");
    seen.add(record.key);
    textKeys.push(record.key);
    textValues.push(record.value);
  }
  return { addressRecord, textKeys, textValues };
}

export function hashV3NormalizationAttestation(attestation: V3NormalizationAttestation): Hex {
  const validUntil = validUint64(attestation.validUntil, "Attestation expiry");
  const signature = validSignature(attestation.signature);
  return keccak256(encodeAbiParameters(
    [{ type: "uint64" }, { type: "bytes32" }],
    [validUntil, keccak256(signature)],
  ));
}

function offerState(value: number): V3OfferState {
  return (["none", "active", "refunded", "accepted"] as const)[value] ?? "none";
}

function normalizeListingItem(item: unknown): V3Listing {
  const entry = item as {
    tokenId: bigint;
    listing: {
      seller: Address;
      price: bigint;
      deadline: bigint;
      transferNonce: bigint;
      listingNonce: bigint;
      feeBps: number;
    };
  };
  return { tokenId: entry.tokenId, ...entry.listing, seller: getAddress(entry.listing.seller) };
}

function normalizeOfferItem(item: unknown): V3Offer {
  const entry = item as {
    offerId: Hex;
    offer: {
      tokenId: bigint;
      buyer: Address;
      recipient: Address;
      ownerSnapshot: Address;
      amount: bigint;
      deadline: bigint;
      transferNonce: bigint;
      feeBps: number;
    };
    state: number;
    stale: boolean;
  };
  return {
    offerId: entry.offerId,
    ...entry.offer,
    buyer: getAddress(entry.offer.buyer),
    recipient: getAddress(entry.offer.recipient),
    ownerSnapshot: getAddress(entry.offer.ownerSnapshot),
    state: offerState(entry.state),
    stale: entry.stale,
  };
}

function normalizeAuctionItem(item: unknown): V3Auction {
  const entry = item as {
    tokenId: bigint;
    auction: Omit<V3Auction, "tokenId">;
  };
  return {
    tokenId: entry.tokenId,
    ...entry.auction,
    seller: getAddress(entry.auction.seller),
    highestBidder: getAddress(entry.auction.highestBidder),
    highestBidRecipient: getAddress(entry.auction.highestBidRecipient),
  };
}

function pageInput(cursor: bigint, limit: number) {
  validUint256(cursor, "Cursor");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new InvalidInputError("Page limit must be 1-50.");
}

export async function createSepbaseV3Client(options: Parameters<typeof createV3SuiteContext>[0]): Promise<SepbaseV3Client> {
  const context = await createV3SuiteContext(options);
  return createSepbaseV3ClientFromVerifiedContext(context);
}

/** Advanced injection boundary for an already runtime-verified suite context. */
export async function createSepbaseV3ClientFromVerifiedContext(
  context: V3SuiteContext,
): Promise<SepbaseV3Client> {
  const { manifest, publicClient, contracts } = context;
  if (manifest.releaseStatus === "draft") throw new NotDeployedError();
  await verifyV3SuiteReleaseId(manifest);
  assertV3VerificationBlock(manifest, context.verificationBlockNumber);
  for (const key of V3_SUITE_MODULE_KEYS) {
    if (!manifest.contracts[key].address || manifest.contracts[key].address !== contracts[key].address) {
      throw new ManifestMismatchError("Injected V3 context contract addresses do not match its manifest.");
    }
  }
  const limits = {
    minCodePoints: manifest.nameRules.minCodepoints,
    maxCodePoints: manifest.nameRules.maxCodepoints,
    maxUtf8Bytes: manifest.nameRules.maxUtf8Bytes,
  };

  const normalize = (input: string) => normalizeName(input, manifest.suffix, limits);
  const canonical = (input: string) => assertCanonicalLabel(input, manifest.suffix, limits);

  function approval(spender: Address, amount: bigint): V3SettlementApprovalPlan | null {
    if (manifest.settlement.kind !== "erc20" || !manifest.settlement.tokenAddress || amount === 0n) return null;
    return {
      token: manifest.settlement.tokenAddress,
      spender,
      amount,
      data: encodeFunctionData({ abi: erc20ApprovalAbi, functionName: "approve", args: [spender, amount] }),
    };
  }

  function plan(options: {
    sender: Address;
    to: Address;
    abi: typeof chainNameControllerV3Abi | typeof chainNameMarketplaceV3Abi | typeof chainNameMigrationV3Abi | typeof chainNameRegistryV3Abi | typeof chainNameResolverV3Abi;
    functionName: string;
    args: readonly unknown[];
    blockNumber: bigint;
    amount?: bigint;
  }): V3TransactionPlan {
    const amount = options.amount ?? 0n;
    validUint256(amount, "Transaction value");
    if (options.blockNumber < context.verificationBlockNumber) {
      throw new ManifestMismatchError("A V3 plan cannot predate the suite verification block.");
    }
    const transactionPlan: V3TransactionPlan = {
      suiteReleaseId: manifest.suiteReleaseId,
      chainId: manifest.chainId,
      expectedSender: options.sender,
      to: options.to,
      data: encodeFunctionData({
        abi: options.abi,
        functionName: options.functionName,
        args: options.args,
      } as never),
      value: manifest.settlement.kind === "native" ? amount : 0n,
      functionName: options.functionName,
      blockNumber: options.blockNumber,
      settlementApproval: approval(options.to, amount),
    };
    assertTransactionPlan(transactionPlan);
    return transactionPlan;
  }

  function assertTransactionPlan(transactionPlan: V3TransactionPlan) {
    if (
      transactionPlan.suiteReleaseId !== manifest.suiteReleaseId
      || transactionPlan.chainId !== manifest.chainId
      || transactionPlan.blockNumber < context.verificationBlockNumber
    ) throw new ManifestMismatchError("Prepared plan belongs to another or unverified V3 suite context.");
    validAddress(transactionPlan.expectedSender, "Plan sender");
    const target = validAddress(transactionPlan.to, "Plan target");
    validUint256(transactionPlan.blockNumber, "Plan block number");
    validUint256(transactionPlan.value, "Plan native value");
    const contract = Object.values(contracts).find((candidate) => candidate.address === target);
    if (!contract) throw new ManifestMismatchError("Prepared plan target is outside the verified V3 suite.");
    let decodedFunctionName: string;
    try {
      decodedFunctionName = decodeFunctionData({ abi: contract.abi, data: transactionPlan.data }).functionName;
    } catch {
      throw new ManifestMismatchError("Prepared plan calldata is not valid for its verified target ABI.");
    }
    if (decodedFunctionName !== transactionPlan.functionName) {
      throw new ManifestMismatchError("Prepared plan function metadata does not match its calldata.");
    }
    if (manifest.settlement.kind === "erc20" && transactionPlan.value !== 0n) {
      throw new ManifestMismatchError("ERC-20 settlement plans cannot attach native value.");
    }
    if (transactionPlan.settlementApproval) {
      const approvalPlan = transactionPlan.settlementApproval;
      if (
        manifest.settlement.kind !== "erc20"
        || !manifest.settlement.tokenAddress
        || approvalPlan.token !== manifest.settlement.tokenAddress
        || approvalPlan.spender !== target
        || approvalPlan.amount <= 0n
        || approvalPlan.amount > UINT256_MAX
        || approvalPlan.data !== encodeFunctionData({
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [target, approvalPlan.amount],
        })
      ) throw new ManifestMismatchError("Settlement approval is not bound to the verified plan target and asset.");
    }
  }

  async function snapshot(blockNumber?: bigint) {
    return blockNumber ?? publicClient.getBlockNumber();
  }

  async function blockTimestamp(blockNumber: bigint) {
    return (await publicClient.getBlock({ blockNumber })).timestamp;
  }

  async function quoteRegistration(
    label: string,
    durationYears: 1 | 2 | 3 | 4 | 5,
    blockNumber?: bigint,
  ) {
    const normalized = canonical(label);
    if (!manifest.nameRules.allowedYears.includes(durationYears)) throw new InvalidInputError("Unsupported duration.");
    return publicClient.readContract({
      address: contracts.controller.address,
      abi: chainNameControllerV3Abi,
      functionName: "quote",
      args: [normalized.normalizedLabel, durationYears],
      blockNumber,
    });
  }

  async function validateAttestation(
    normalized: NormalizedName,
    recipient: Address,
    attestation: V3NormalizationAttestation,
    blockNumber: bigint,
  ) {
    const validUntil = validUint64(attestation.validUntil, "Attestation expiry");
    const signature = validSignature(attestation.signature);
    const now = await blockTimestamp(blockNumber);
    if (validUntil <= now || validUntil - now > BigInt(manifest.normalization.maxAttestationValiditySeconds)) {
      throw new InvalidInputError("Normalization attestation is expired or outside the manifest validity window.");
    }
    const digest = hashTypedData({
      domain: {
        name: "ChainNameControllerV3",
        version: "3",
        chainId: manifest.chainId,
        verifyingContract: contracts.controller.address,
      },
      types: {
        NormalizationAttestation: [
          { name: "chainId", type: "uint256" },
          { name: "controller", type: "address" },
          { name: "normalizationProfileHash", type: "bytes32" },
          { name: "labelHash", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "validUntil", type: "uint64" },
        ],
      },
      primaryType: "NormalizationAttestation",
      message: {
        chainId: BigInt(manifest.chainId),
        controller: contracts.controller.address,
        normalizationProfileHash: manifest.normalization.profileHash,
        labelHash: normalized.labelHash,
        recipient,
        validUntil,
      },
    });
    const [onchainDigest, onchainHash] = await Promise.all([
      publicClient.readContract({
        address: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "normalizationAttestationDigest",
        args: [normalized.labelHash, recipient, validUntil],
        blockNumber,
      }),
      publicClient.readContract({
        address: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "hashNormalizationAttestation",
        args: [{ validUntil, signature }],
        blockNumber,
      }),
    ]);
    if (digest !== onchainDigest) throw new ManifestMismatchError("Off-chain EIP-712 digest does not match the controller helper.");
    const committedHash = hashV3NormalizationAttestation({ validUntil, signature });
    if (committedHash !== onchainHash) throw new ManifestMismatchError("Off-chain attestation commitment hash does not match the controller helper.");
    return { validUntil, signature, digest, committedHash };
  }

  function validateRegistrationScope(input: V3RegistrationScope): V3RegistrationScope {
    const normalized = canonical(input.label);
    const payer = validAddress(input.payer, "Scope payer");
    const recipient = validAddress(input.recipient, "Scope recipient");
    const referrer = validAddress(input.referrer, "Scope referrer", true);
    const controller = validAddress(input.controller, "Scope controller");
    if (
      input.suiteReleaseId !== manifest.suiteReleaseId
      || input.chainId !== manifest.chainId
      || controller !== contracts.controller.address
    ) {
      throw new ManifestMismatchError("Registration scope belongs to another V3 suite.");
    }
    if (recipient === contracts.controller.address) throw new InvalidInputError("Scope recipient cannot be the controller contract.");
    if (referrer !== zeroAddress && (referrer === payer || referrer === recipient)) {
      throw new InvalidInputError("Scope referrer cannot equal payer or recipient.");
    }
    if (input.preparedAtBlock < context.verificationBlockNumber) {
      throw new ManifestMismatchError("Registration scope predates the verified V3 suite context.");
    }
    if (normalized.node !== input.node) throw new InvalidInputError("Registration scope node does not match the label.");
    if (!manifest.nameRules.allowedYears.includes(input.durationYears)) throw new InvalidInputError("Unsupported scope duration.");
    if (
      !Number.isInteger(input.expectedReferralRewardBps)
      || input.expectedReferralRewardBps < 0
      || input.expectedReferralRewardBps > 10_000
    ) throw new InvalidInputError("Scope referral BPS is invalid.");
    return {
      ...input,
      label: normalized.normalizedLabel,
      node: validBytes32(input.node, "Scope node"),
      payer,
      recipient,
      referrer,
      controller,
      preparedAtBlock: validUint256(input.preparedAtBlock, "Scope preparation block"),
      expectedAmount: validAmount(input.expectedAmount, "Scope expected amount"),
      resolverInitializationHash: validBytes32(input.resolverInitializationHash, "Scope resolver initialization hash"),
      normalizationAttestationHash: validBytes32(input.normalizationAttestationHash, "Scope attestation hash"),
      normalizationTypedDataDigest: validBytes32(input.normalizationTypedDataDigest, "Scope typed-data digest"),
      commitment: validBytes32(input.commitment, "Scope commitment"),
    };
  }

  async function prepareRegistrationCommit(input: {
    label: string;
    payer: Address;
    recipient: Address;
    durationYears: 1 | 2 | 3 | 4 | 5;
    referrer?: Address | null;
    secret: Hex;
    initialization: V3ResolverInitialization;
    attestation: V3NormalizationAttestation;
  }) {
    const normalized = canonical(input.label);
    const payer = validAddress(input.payer, "Payer");
    const recipient = validAddress(input.recipient, "Recipient");
    const referrer = input.referrer ? validAddress(input.referrer, "Referrer") : zeroAddress;
    if (recipient === contracts.controller.address) throw new InvalidInputError("Recipient cannot be the controller contract.");
    if (referrer !== zeroAddress && (referrer === payer || referrer === recipient)) {
      throw new InvalidInputError("Referrer cannot equal payer or recipient.");
    }
    const secret = validBytes32(input.secret, "Commitment secret");
    const initialization = normalizeInitialization(input.initialization);
    const blockNumber = await snapshot();
    const [expectedAmount, expectedReferralRewardBps, resolverInitializationHash, attestation] = await Promise.all([
      quoteRegistration(normalized.normalizedLabel, input.durationYears, blockNumber),
      publicClient.readContract({
        address: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "referralRewardBps",
        blockNumber,
      }),
      publicClient.readContract({
        address: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "hashResolverInitialization",
        args: [initialization],
        blockNumber,
      }),
      validateAttestation(normalized, recipient, input.attestation, blockNumber),
    ]);
    const commitment = await publicClient.readContract({
      address: contracts.controller.address,
      abi: chainNameControllerV3Abi,
      functionName: "makeCommitment",
      args: [
        normalized.node,
        payer,
        recipient,
        input.durationYears,
        resolverInitializationHash,
        attestation.committedHash,
        referrer,
        secret,
        expectedAmount,
        expectedReferralRewardBps,
      ],
      blockNumber,
    });
    const scope: V3RegistrationScope = {
      suiteReleaseId: manifest.suiteReleaseId,
      chainId: manifest.chainId,
      controller: contracts.controller.address,
      preparedAtBlock: blockNumber,
      label: normalized.normalizedLabel,
      node: normalized.node,
      payer,
      recipient,
      durationYears: input.durationYears,
      referrer,
      expectedAmount,
      expectedReferralRewardBps,
      resolverInitializationHash,
      normalizationAttestationHash: attestation.committedHash,
      normalizationTypedDataDigest: attestation.digest,
      commitment,
    };
    return {
      scope,
      plan: plan({
        sender: payer,
        to: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "commit",
        args: [commitment],
        blockNumber,
      }),
    };
  }

  async function prepareRegistrationReveal(input: {
    scope: V3RegistrationScope;
    secret: Hex;
    initialization: V3ResolverInitialization;
    attestation: V3NormalizationAttestation;
  }) {
    const scope = validateRegistrationScope(input.scope);
    const normalized = canonical(scope.label);
    const secret = validBytes32(input.secret, "Commitment secret");
    const initialization = normalizeInitialization(input.initialization);
    const blockNumber = await snapshot();
    const attestation = await validateAttestation(normalized, scope.recipient, input.attestation, blockNumber);
    const [resolverInitializationHash, expectedReferralRewardBps, expectedAmount, committedAt, consumed] = await Promise.all([
      publicClient.readContract({
        address: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "hashResolverInitialization",
        args: [initialization],
        blockNumber,
      }),
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "referralRewardBps", blockNumber }),
      quoteRegistration(scope.label, scope.durationYears, blockNumber),
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "commitments", args: [scope.commitment], blockNumber }),
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "commitmentConsumed", args: [scope.commitment], blockNumber }),
    ]);
    if (
      resolverInitializationHash !== scope.resolverInitializationHash
      || attestation.committedHash !== scope.normalizationAttestationHash
      || attestation.digest !== scope.normalizationTypedDataDigest
      || expectedAmount !== scope.expectedAmount
      || expectedReferralRewardBps !== scope.expectedReferralRewardBps
    ) throw new SepbaseError("Registration economic or attestation scope changed after commit.", "REGISTRATION_SCOPE_CHANGED", 409);
    const recomputed = await publicClient.readContract({
      address: contracts.controller.address,
      abi: chainNameControllerV3Abi,
      functionName: "makeCommitment",
      args: [
        scope.node,
        scope.payer,
        scope.recipient,
        scope.durationYears,
        scope.resolverInitializationHash,
        scope.normalizationAttestationHash,
        scope.referrer,
        secret,
        scope.expectedAmount,
        scope.expectedReferralRewardBps,
      ],
      blockNumber,
    });
    if (recomputed !== scope.commitment) throw new InvalidInputError("Secret or registration scope does not reproduce the commitment.");
    if (committedAt === 0n || consumed) throw new SepbaseError("Commitment is missing or already consumed.", "COMMITMENT_UNAVAILABLE", 409);
    const [minAge, maxAge] = await Promise.all([
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "minCommitmentAge", blockNumber }),
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "maxCommitmentAge", blockNumber }),
    ]);
    const earliestRevealAt = committedAt + minAge;
    const latestRevealAt = committedAt + maxAge;
    const now = await blockTimestamp(blockNumber);
    if (now < earliestRevealAt) throw new SepbaseError("Commitment has not reached minimum age.", "COMMITMENT_NOT_READY", 409);
    if (now > latestRevealAt) throw new SepbaseError("Commitment expired.", "COMMITMENT_EXPIRED", 409);
    return {
      plan: plan({
        sender: scope.payer,
        to: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "register",
        args: [{
          label: scope.label,
          recipient: scope.recipient,
          durationYears: scope.durationYears,
          referrer: scope.referrer,
          secret,
          resolverInitializationHash: scope.resolverInitializationHash,
          normalizationAttestationHash: scope.normalizationAttestationHash,
          expectedAmount: scope.expectedAmount,
          expectedReferralRewardBps: scope.expectedReferralRewardBps,
        }, initialization, {
          validUntil: attestation.validUntil,
          signature: attestation.signature,
        }],
        blockNumber,
        amount: scope.expectedAmount,
      }),
      earliestRevealAt,
      latestRevealAt,
    };
  }

  async function prepareRenew(input: { owner: Address; tokenId: bigint; durationYears: 1 | 2 | 3 | 4 | 5 }) {
    const owner = validAddress(input.owner, "Owner");
    validUint256(input.tokenId, "Token ID");
    const blockNumber = await snapshot();
    const [label] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "labelOf", args: [input.tokenId], blockNumber }),
      assertTokenOwner(owner, input.tokenId, blockNumber),
    ]);
    const expectedAmount = await quoteRegistration(label, input.durationYears, blockNumber);
    return plan({
      sender: owner,
      to: contracts.controller.address,
      abi: chainNameControllerV3Abi,
      functionName: "renew",
      args: [input.tokenId, input.durationYears, expectedAmount],
      blockNumber,
      amount: expectedAmount,
    });
  }

  async function resolveAddress(label: string, blockNumber?: bigint) {
    const normalized = normalize(label);
    const address = await publicClient.readContract({
      address: contracts.resolver.address,
      abi: chainNameResolverV3Abi,
      functionName: "addr",
      args: [normalized.node],
      blockNumber,
    });
    return address === zeroAddress ? null : getAddress(address);
  }

  async function resolveText(label: string, key: string, blockNumber?: bigint) {
    if (!key || textBytes(key) > MAX_TEXT_KEY_BYTES) throw new InvalidInputError("Text key is invalid.");
    const normalized = normalize(label);
    return publicClient.readContract({
      address: contracts.resolver.address,
      abi: chainNameResolverV3Abi,
      functionName: "text",
      args: [normalized.node, key],
      blockNumber,
    });
  }

  async function verifyAddress(accountInput: Address, blockNumber?: bigint): Promise<V3AddressVerification> {
    const account = validAddress(accountInput, "Account");
    const at = await snapshot(blockNumber);
    const name = await publicClient.readContract({
      address: contracts.resolver.address,
      abi: chainNameResolverV3Abi,
      functionName: "primaryNameOf",
      args: [account],
      blockNumber: at,
    });
    if (!name) return { address: account, name: null, verified: false, reason: "no-primary", blockNumber: at };
    let normalized: NormalizedName;
    try {
      normalized = normalize(name);
      if (name !== normalized.normalizedFullName) throw new Error("non-canonical primary");
    } catch {
      return { address: account, name, verified: false, reason: "invalid-primary", blockNumber: at };
    }
    const record = await getNameRecord(normalized.normalizedLabel, at);
    if (record.status !== "active" && record.status !== "grace") {
      return { address: account, name, verified: false, reason: "inactive", blockNumber: at };
    }
    if (record.owner !== account) {
      return { address: account, name, verified: false, reason: "owner-mismatch", blockNumber: at };
    }
    if (record.resolvedAddress !== account) {
      return { address: account, name, verified: false, reason: "forward-mismatch", blockNumber: at };
    }
    return { address: account, name, verified: true, reason: null, blockNumber: at };
  }

  async function reverseResolve(accountInput: Address, blockNumber?: bigint) {
    const result = await verifyAddress(accountInput, blockNumber);
    return { name: result.name, verified: result.verified };
  }

  async function getNameRecord(label: string, blockNumber?: bigint): Promise<V3NameRecord> {
    const normalized = normalize(label);
    const at = await snapshot(blockNumber);
    const [statusValue, available, reserved, transferNonce, expiresAt, resolvedAddress] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "statusOf", args: [normalized.tokenId], blockNumber: at }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "isAvailable", args: [normalized.normalizedLabel], blockNumber: at }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "reservedLabels", args: [normalized.labelHash], blockNumber: at }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "transferNonce", args: [normalized.tokenId], blockNumber: at }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "expiresAt", args: [normalized.tokenId], blockNumber: at }),
      publicClient.readContract({ address: contracts.resolver.address, abi: chainNameResolverV3Abi, functionName: "addr", args: [normalized.node], blockNumber: at }),
    ]);
    const statuses = ["unregistered", "active", "grace", "released"] as const;
    const status = statuses[statusValue] ?? "unregistered";
    let owner: Address | null = null;
    if (status !== "unregistered") {
      try {
        owner = getAddress(await publicClient.readContract({
          address: contracts.registry.address,
          abi: chainNameRegistryV3Abi,
          functionName: "ownerOf",
          args: [normalized.tokenId],
          blockNumber: at,
        }));
      } catch {
        owner = null;
      }
    }
    return {
      label: normalized.normalizedLabel,
      fullName: normalized.normalizedFullName,
      node: normalized.node,
      tokenId: normalized.tokenId,
      status,
      owner,
      resolvedAddress: resolvedAddress === zeroAddress ? null : getAddress(resolvedAddress),
      expiresAt: expiresAt === 0n ? null : expiresAt,
      available,
      reserved,
      transferNonce,
      blockNumber: at,
    };
  }

  async function getOwnedNames(
    accountInput: Address,
    cursor = 0n,
    limit = 24,
    blockNumber?: bigint,
  ): Promise<V3OwnedNamePage> {
    pageInput(cursor, limit);
    const account = validAddress(accountInput, "Account");
    const at = await snapshot(blockNumber);
    const total = await publicClient.readContract({
      address: contracts.registry.address,
      abi: chainNameRegistryV3Abi,
      functionName: "balanceOf",
      args: [account],
      blockNumber: at,
    });
    if (cursor >= total) return { items: [], total, nextCursor: total, blockNumber: at };
    const end = cursor + BigInt(limit) < total ? cursor + BigInt(limit) : total;
    const count = Number(end - cursor);
    const tokenIds = await Promise.all(Array.from({ length: count }, (_, index) =>
      publicClient.readContract({
        address: contracts.registry.address,
        abi: chainNameRegistryV3Abi,
        functionName: "tokenOfOwnerByIndex",
        args: [account, cursor + BigInt(index)],
        blockNumber: at,
      })));
    const labels = await Promise.all(tokenIds.map((tokenId) => publicClient.readContract({
      address: contracts.registry.address,
      abi: chainNameRegistryV3Abi,
      functionName: "labelOf",
      args: [tokenId],
      blockNumber: at,
    })));
    const items = await Promise.all(labels.map((label) => getNameRecord(label, at)));
    for (let index = 0; index < items.length; index += 1) {
      if (items[index]?.tokenId !== tokenIds[index] || items[index]?.owner !== account) {
        throw new ManifestMismatchError("Owner enumeration changed inside the pinned V3 account snapshot.");
      }
    }
    return { items, total, nextCursor: end, blockNumber: at };
  }

  async function getAccountBalances(accountInput: Address, blockNumber?: bigint): Promise<V3AccountBalances> {
    const account = validAddress(accountInput, "Account");
    const at = await snapshot(blockNumber);
    const [referralRewards, marketplaceClaimable, primary] = await Promise.all([
      publicClient.readContract({
        address: contracts.controller.address,
        abi: chainNameControllerV3Abi,
        functionName: "referralBalance",
        args: [account],
        blockNumber: at,
      }),
      publicClient.readContract({
        address: contracts.marketplace.address,
        abi: chainNameMarketplaceV3Abi,
        functionName: "claimableBalance",
        args: [account],
        blockNumber: at,
      }),
      verifyAddress(account, at),
    ]);
    return { account, referralRewards, marketplaceClaimable, primary, blockNumber: at };
  }

  async function getListings(cursor = 0n, limit = 24, blockNumber?: bigint) {
    pageInput(cursor, limit);
    const at = await snapshot(blockNumber);
    const [items, nextCursor] = await publicClient.readContract({
      address: contracts.marketLens.address,
      abi: chainNameMarketLensV3Abi,
      functionName: "getListings",
      args: [cursor, BigInt(limit)],
      blockNumber: at,
    });
    return { items: items.map(normalizeListingItem), nextCursor, blockNumber: at };
  }

  async function readOffers(
    scope: "global" | "buyer" | "owner",
    account: Address | null,
    cursor: bigint,
    limit: number,
    includeTerminal: boolean,
    blockNumber?: bigint,
  ) {
    pageInput(cursor, limit);
    const at = await snapshot(blockNumber);
    const call = scope === "global"
      ? publicClient.readContract({
          address: contracts.marketLens.address,
          abi: chainNameMarketLensV3Abi,
          functionName: "getGlobalOffers",
          args: [cursor, BigInt(limit), includeTerminal],
          blockNumber: at,
        })
      : scope === "buyer"
        ? publicClient.readContract({
            address: contracts.marketLens.address,
            abi: chainNameMarketLensV3Abi,
            functionName: "getBuyerOffers",
            args: [validAddress(account!, "Buyer"), cursor, BigInt(limit), includeTerminal],
            blockNumber: at,
          })
        : publicClient.readContract({
            address: contracts.marketLens.address,
            abi: chainNameMarketLensV3Abi,
            functionName: "getOwnerOffers",
            args: [validAddress(account!, "Owner"), cursor, BigInt(limit), includeTerminal],
            blockNumber: at,
          });
    const [items, nextCursor] = await call;
    return { items: items.map(normalizeOfferItem), nextCursor, blockNumber: at };
  }

  async function getAuctions(cursor = 0n, limit = 24, blockNumber?: bigint) {
    pageInput(cursor, limit);
    const at = await snapshot(blockNumber);
    const [items, nextCursor] = await publicClient.readContract({
      address: contracts.marketLens.address,
      abi: chainNameMarketLensV3Abi,
      functionName: "getAuctions",
      args: [cursor, BigInt(limit)],
      blockNumber: at,
    });
    return { items: items.map(normalizeAuctionItem), nextCursor, blockNumber: at };
  }

  async function listingAt(tokenId: bigint, blockNumber: bigint): Promise<V3Listing> {
    validUint256(tokenId, "Token ID");
    const [seller, price, deadline, transferNonce, listingNonce, feeBps] = await publicClient.readContract({
      address: contracts.marketplace.address,
      abi: chainNameMarketplaceV3Abi,
      functionName: "listings",
      args: [tokenId],
      blockNumber,
    });
    if (seller === zeroAddress) throw new SepbaseError("Listing is not active.", "LISTING_NOT_FOUND", 404);
    return { tokenId, seller: getAddress(seller), price, deadline, transferNonce, listingNonce, feeBps };
  }

  async function listingIsStale(listing: V3Listing, blockNumber: bigint) {
    if (await blockTimestamp(blockNumber) > listing.deadline) return true;
    try {
      const status = await publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "statusOf", args: [listing.tokenId], blockNumber });
      if (status !== 1) return true;
      const [owner, transferNonce, approved, approvedForAll] = await Promise.all([
        publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [listing.tokenId], blockNumber }),
        publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "transferNonce", args: [listing.tokenId], blockNumber }),
        publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "getApproved", args: [listing.tokenId], blockNumber }),
        publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "isApprovedForAll", args: [listing.seller, contracts.marketplace.address], blockNumber }),
      ]);
      return getAddress(owner) !== listing.seller
        || transferNonce !== listing.transferNonce
        || (getAddress(approved) !== contracts.marketplace.address && !approvedForAll);
    } catch (error) {
      if (error instanceof SepbaseError) throw error;
      throw new RpcUnavailableError("The listing lifecycle or approval snapshot could not be verified.");
    }
  }

  async function offerAt(offerId: Hex, blockNumber: bigint): Promise<V3Offer> {
    const [offer, state] = await Promise.all([
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "offers", args: [offerId], blockNumber }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "offerStates", args: [offerId], blockNumber }),
    ]);
    const [tokenId, buyer, recipient, ownerSnapshot, amount, deadline, transferNonce, feeBps] = offer;
    if (state === 0) throw new SepbaseError("Offer does not exist.", "OFFER_NOT_FOUND", 404);
    let stale = state !== 1 || deadline <= await blockTimestamp(blockNumber);
    if (!stale) {
      try {
        const status = await publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "statusOf", args: [tokenId], blockNumber });
        if (status !== 1) stale = true;
        else {
          const [owner, nonce] = await Promise.all([
            publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [tokenId], blockNumber }),
            publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "transferNonce", args: [tokenId], blockNumber }),
          ]);
          stale = getAddress(owner) !== getAddress(ownerSnapshot) || nonce !== transferNonce;
        }
      } catch (error) {
        if (error instanceof SepbaseError) throw error;
        throw new RpcUnavailableError("The offer lifecycle snapshot could not be verified.");
      }
    }
    return {
      offerId,
      tokenId,
      buyer: getAddress(buyer),
      recipient: getAddress(recipient),
      ownerSnapshot: getAddress(ownerSnapshot),
      amount,
      deadline,
      transferNonce,
      feeBps,
      state: offerState(state),
      stale,
    };
  }

  async function auctionAt(tokenId: bigint, blockNumber: bigint): Promise<V3Auction> {
    validUint256(tokenId, "Token ID");
    const [seller, highestBidder, highestBidRecipient, reservePrice, highestBid, startAt, endAt, hardEndAt, transferNonce, auctionNonce, feeBps, extensionsUsed] = await publicClient.readContract({
      address: contracts.marketplace.address,
      abi: chainNameMarketplaceV3Abi,
      functionName: "auctions",
      args: [tokenId],
      blockNumber,
    });
    if (seller === zeroAddress) throw new SepbaseError("Auction is not active.", "AUCTION_NOT_FOUND", 404);
    return { tokenId, seller: getAddress(seller), highestBidder: getAddress(highestBidder), highestBidRecipient: getAddress(highestBidRecipient), reservePrice, highestBid, startAt, endAt, hardEndAt, transferNonce, auctionNonce, feeBps, extensionsUsed };
  }

  async function prepareMarketplaceApproval(input: { owner: Address; tokenId: bigint }) {
    const owner = validAddress(input.owner, "Owner");
    validUint256(input.tokenId, "Token ID");
    const blockNumber = await snapshot();
    const [currentOwner, approved, approvedForAll] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "getApproved", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "isApprovedForAll", args: [owner, contracts.marketplace.address], blockNumber }),
    ]);
    if (getAddress(currentOwner) !== owner) throw new InvalidInputError("Owner is not the current token owner.");
    if (getAddress(approved) === contracts.marketplace.address || approvedForAll) {
      throw new SepbaseError("Marketplace transfer approval is already active.", "MARKETPLACE_ALREADY_APPROVED", 409);
    }
    return plan({
      sender: owner,
      to: contracts.registry.address,
      abi: chainNameRegistryV3Abi,
      functionName: "approve",
      args: [contracts.marketplace.address, input.tokenId],
      blockNumber,
    });
  }

  async function marketplaceApprovalActive(owner: Address, tokenId: bigint, blockNumber: bigint) {
    const [approved, approvedForAll] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "getApproved", args: [tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "isApprovedForAll", args: [owner, contracts.marketplace.address], blockNumber }),
    ]);
    return getAddress(approved) === contracts.marketplace.address || approvedForAll;
  }

  async function prepareList(input: { seller: Address; tokenId: bigint; price: bigint; deadline: bigint }) {
    const seller = validAddress(input.seller, "Seller");
    validAmount(input.price, "Listing price");
    validUint64(input.deadline, "Listing deadline");
    const blockNumber = await snapshot();
    const now = await blockTimestamp(blockNumber);
    if (input.deadline <= now || input.deadline > now + MAX_LISTING_DURATION) throw new InvalidInputError("Listing deadline is outside the contract window.");
    const [status, owner, transferNonce, feeBps, approved] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "statusOf", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "transferNonce", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "marketplaceFeeBps", blockNumber }),
      marketplaceApprovalActive(seller, input.tokenId, blockNumber),
    ]);
    if (status !== 1) throw new SepbaseError("Only an active name can be listed.", "NAME_NOT_ACTIVE", 409);
    if (getAddress(owner) !== seller) throw new InvalidInputError("Seller is not the current owner.");
    if (!approved) {
      throw new SepbaseError("Per-token marketplace approval is required before listing.", "MARKETPLACE_APPROVAL_REQUIRED", 409);
    }
    return plan({ sender: seller, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "listName", args: [{ tokenId: input.tokenId, price: input.price, deadline: input.deadline, expectedTransferNonce: transferNonce, expectedFeeBps: feeBps }], blockNumber });
  }

  async function prepareUpdateListing(input: { seller: Address; tokenId: bigint; newPrice: bigint; newDeadline: bigint }) {
    const seller = validAddress(input.seller, "Seller");
    validAmount(input.newPrice, "New listing price");
    validUint64(input.newDeadline, "New listing deadline");
    const blockNumber = await snapshot();
    const now = await blockTimestamp(blockNumber);
    if (input.newDeadline <= now || input.newDeadline > now + MAX_LISTING_DURATION) throw new InvalidInputError("New listing deadline is outside the contract window.");
    const [listing, currentFeeBps] = await Promise.all([
      listingAt(input.tokenId, blockNumber),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "marketplaceFeeBps", blockNumber }),
    ]);
    if (listing.seller !== seller) throw new InvalidInputError("Seller does not match the active listing.");
    if (await listingIsStale(listing, blockNumber)) {
      throw new SepbaseError("Listing is stale and must be invalidated.", "LISTING_NOT_ACTIVE", 409);
    }
    return plan({
      sender: seller,
      to: contracts.marketplace.address,
      abi: chainNameMarketplaceV3Abi,
      functionName: "updateListing",
      args: [input.tokenId, listing.price, listing.deadline, listing.transferNonce, listing.listingNonce, listing.feeBps, input.newPrice, input.newDeadline, currentFeeBps],
      blockNumber,
    });
  }

  async function prepareCancelListing(input: { seller: Address; tokenId: bigint }) {
    const seller = validAddress(input.seller, "Seller");
    const blockNumber = await snapshot();
    const listing = await listingAt(input.tokenId, blockNumber);
    if (listing.seller !== seller) throw new InvalidInputError("Seller does not match the active listing.");
    return plan({
      sender: seller,
      to: contracts.marketplace.address,
      abi: chainNameMarketplaceV3Abi,
      functionName: "cancelListing",
      args: [input.tokenId, listing.price, listing.deadline, listing.transferNonce, listing.listingNonce, listing.feeBps],
      blockNumber,
    });
  }

  async function prepareInvalidateListing(input: { caller: Address; tokenId: bigint }) {
    const caller = validAddress(input.caller, "Caller");
    validUint256(input.tokenId, "Token ID");
    const blockNumber = await snapshot();
    const listing = await listingAt(input.tokenId, blockNumber);
    const stale = await listingIsStale(listing, blockNumber);
    if (!stale) throw new InvalidInputError("Only a stale listing can be invalidated.");
    return plan({
      sender: caller,
      to: contracts.marketplace.address,
      abi: chainNameMarketplaceV3Abi,
      functionName: "invalidateListing",
      args: [input.tokenId],
      blockNumber,
    });
  }

  async function prepareBuy(input: { buyer: Address; tokenId: bigint; recipient?: Address }) {
    const buyer = validAddress(input.buyer, "Buyer");
    const recipient = input.recipient ? validAddress(input.recipient, "Recipient") : buyer;
    const blockNumber = await snapshot();
    const listing = await listingAt(input.tokenId, blockNumber);
    if (listing.seller === buyer) throw new InvalidInputError("Buyer cannot be the seller.");
    if (await listingIsStale(listing, blockNumber)) {
      throw new SepbaseError("Listing is stale or expired.", "LISTING_NOT_ACTIVE", 409);
    }
    return plan({ sender: buyer, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "buyName", args: [{ tokenId: input.tokenId, expectedSeller: listing.seller, recipient, expectedPrice: listing.price, expectedDeadline: listing.deadline, expectedListingNonce: listing.listingNonce, expectedFeeBps: listing.feeBps }], blockNumber, amount: listing.price });
  }

  async function prepareOffer(input: { buyer: Address; tokenId: bigint; recipient?: Address; amount: bigint; deadline: bigint }) {
    const buyer = validAddress(input.buyer, "Buyer");
    const recipient = input.recipient ? validAddress(input.recipient, "Recipient") : buyer;
    validAmount(input.amount, "Offer amount");
    validUint64(input.deadline, "Offer deadline");
    const blockNumber = await snapshot();
    const now = await blockTimestamp(blockNumber);
    if (input.deadline <= now || input.deadline > now + MAX_OFFER_DURATION) throw new InvalidInputError("Offer deadline is outside the contract window.");
    const [status, owner, transferNonce, feeBps] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "statusOf", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "transferNonce", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "marketplaceFeeBps", blockNumber }),
    ]);
    if (status !== 1) throw new SepbaseError("Only an active name can receive an offer.", "NAME_NOT_ACTIVE", 409);
    if (getAddress(owner) === buyer) throw new InvalidInputError("Owner cannot offer on their own name.");
    return plan({ sender: buyer, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "makeOffer", args: [{ tokenId: input.tokenId, recipient, expectedOwner: getAddress(owner), amount: input.amount, deadline: input.deadline, expectedTransferNonce: transferNonce, expectedFeeBps: feeBps }], blockNumber, amount: input.amount });
  }

  async function prepareAcceptOffer(input: { seller: Address; offerId: Hex }) {
    const seller = validAddress(input.seller, "Seller");
    const offerId = validBytes32(input.offerId, "Offer ID");
    const blockNumber = await snapshot();
    const offer = await offerAt(offerId, blockNumber);
    if (offer.state !== "active" || offer.stale) throw new SepbaseError("Offer is not active for the current owner.", "OFFER_NOT_ACTIVE", 409);
    const [owner, approved] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [offer.tokenId], blockNumber }),
      marketplaceApprovalActive(seller, offer.tokenId, blockNumber),
    ]);
    if (getAddress(owner) !== seller || offer.ownerSnapshot !== seller) throw new InvalidInputError("Seller or ownership snapshot does not match.");
    if (!approved) {
      throw new SepbaseError("Per-token marketplace approval is required before accepting an offer.", "MARKETPLACE_APPROVAL_REQUIRED", 409);
    }
    return plan({ sender: seller, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "acceptOffer", args: [{ offerId, expectedBuyer: offer.buyer, expectedRecipient: offer.recipient, expectedAmount: offer.amount, expectedDeadline: offer.deadline, expectedFeeBps: offer.feeBps }], blockNumber });
  }

  async function prepareCancelOffer(input: { buyer: Address; offerId: Hex }) {
    const buyer = validAddress(input.buyer, "Buyer");
    const offerId = validBytes32(input.offerId, "Offer ID");
    const blockNumber = await snapshot();
    const offer = await offerAt(offerId, blockNumber);
    if (offer.state !== "active" || offer.buyer !== buyer) throw new InvalidInputError("Buyer does not own an active offer.");
    return plan({
      sender: buyer,
      to: contracts.marketplace.address,
      abi: chainNameMarketplaceV3Abi,
      functionName: "cancelOffer",
      args: [offerId, offer.amount, offer.deadline, offer.feeBps],
      blockNumber,
    });
  }

  async function prepareInvalidateOffer(input: { caller: Address; offerId: Hex }) {
    const caller = validAddress(input.caller, "Caller");
    const offerId = validBytes32(input.offerId, "Offer ID");
    const blockNumber = await snapshot();
    const offer = await offerAt(offerId, blockNumber);
    if (offer.state !== "active" || !offer.stale) throw new InvalidInputError("Only an active stale/expired offer can be invalidated.");
    return plan({ sender: caller, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "invalidateOffer", args: [offerId], blockNumber });
  }

  async function prepareStartAuction(input: { seller: Address; tokenId: bigint; reservePrice: bigint; startAt: bigint; endAt: bigint }) {
    const seller = validAddress(input.seller, "Seller");
    validAmount(input.reservePrice, "Reserve price");
    validUint64(input.startAt, "Auction start");
    validUint64(input.endAt, "Auction end");
    const blockNumber = await snapshot();
    const now = await blockTimestamp(blockNumber);
    if (input.startAt < now || input.startAt > now + MAX_AUCTION_START_DELAY || input.endAt <= input.startAt || input.endAt > input.startAt + MAX_AUCTION_DURATION) throw new InvalidInputError("Auction schedule is outside the contract window.");
    const [status, owner, transferNonce, feeBps, approved] = await Promise.all([
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "statusOf", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "transferNonce", args: [input.tokenId], blockNumber }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "marketplaceFeeBps", blockNumber }),
      marketplaceApprovalActive(seller, input.tokenId, blockNumber),
    ]);
    if (status !== 1) throw new SepbaseError("Only an active name can enter an auction.", "NAME_NOT_ACTIVE", 409);
    if (getAddress(owner) !== seller) throw new InvalidInputError("Seller is not the current owner.");
    if (!approved) {
      throw new SepbaseError("Per-token marketplace approval is required before starting an auction.", "MARKETPLACE_APPROVAL_REQUIRED", 409);
    }
    return plan({ sender: seller, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "startAuction", args: [{ tokenId: input.tokenId, reservePrice: input.reservePrice, startAt: input.startAt, endAt: input.endAt, expectedTransferNonce: transferNonce, expectedFeeBps: feeBps }], blockNumber });
  }

  async function prepareCancelAuction(input: { seller: Address; tokenId: bigint }) {
    const seller = validAddress(input.seller, "Seller");
    const blockNumber = await snapshot();
    const auction = await auctionAt(input.tokenId, blockNumber);
    if (auction.seller !== seller) throw new InvalidInputError("Seller does not match the active auction.");
    if (auction.highestBid !== 0n) throw new SepbaseError("An auction with a bid cannot be cancelled.", "AUCTION_HAS_BID", 409);
    return plan({
      sender: seller,
      to: contracts.marketplace.address,
      abi: chainNameMarketplaceV3Abi,
      functionName: "cancelAuction",
      args: [input.tokenId, auction.reservePrice, auction.endAt, auction.auctionNonce, auction.feeBps],
      blockNumber,
    });
  }

  async function prepareBid(input: { bidder: Address; tokenId: bigint; recipient?: Address; amount: bigint }) {
    const bidder = validAddress(input.bidder, "Bidder");
    const recipient = input.recipient ? validAddress(input.recipient, "Recipient") : bidder;
    validAmount(input.amount, "Bid amount");
    const blockNumber = await snapshot();
    const auction = await auctionAt(input.tokenId, blockNumber);
    const now = await blockTimestamp(blockNumber);
    if (now < auction.startAt || now >= auction.endAt) {
      throw new SepbaseError("Auction is not open for bids.", "AUCTION_NOT_OPEN", 409);
    }
    if (bidder === auction.seller || recipient === auction.seller) {
      throw new InvalidInputError("Auction seller cannot bid or receive a bid.");
    }
    const increment = auction.highestBid === 0n
      ? 0n
      : ((auction.highestBid / 10_000n) * BigInt(manifest.marketplace.minBidIncrementBps)
        + ((auction.highestBid % 10_000n) * BigInt(manifest.marketplace.minBidIncrementBps)) / 10_000n);
    const minimum = auction.highestBid === 0n
      ? auction.reservePrice
      : auction.highestBid + (increment === 0n ? 1n : increment);
    if (input.amount < minimum) throw new InvalidInputError(`Bid amount must be at least ${minimum.toString()} base units.`);
    return plan({ sender: bidder, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "placeBid", args: [{ tokenId: input.tokenId, amount: input.amount, recipient, expectedHighestBidder: auction.highestBidder, expectedHighestBidRecipient: auction.highestBidRecipient, expectedHighestBid: auction.highestBid, expectedEndAt: auction.endAt, expectedAuctionNonce: auction.auctionNonce, expectedFeeBps: auction.feeBps }], blockNumber, amount: input.amount });
  }

  async function prepareFinalizeAuction(input: { caller: Address; tokenId: bigint }) {
    const caller = validAddress(input.caller, "Caller");
    const blockNumber = await snapshot();
    const auction = await auctionAt(input.tokenId, blockNumber);
    if (await blockTimestamp(blockNumber) < auction.endAt) {
      throw new SepbaseError("Auction has not ended.", "AUCTION_NOT_ENDED", 409);
    }
    return plan({ sender: caller, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "finalizeAuction", args: [{ tokenId: input.tokenId, expectedHighestBidder: auction.highestBidder, expectedHighestBidRecipient: auction.highestBidRecipient, expectedHighestBid: auction.highestBid, expectedEndAt: auction.endAt, expectedAuctionNonce: auction.auctionNonce, expectedFeeBps: auction.feeBps }], blockNumber });
  }

  function claimRecipient(value: Address | undefined, account: Address) {
    const recipient = value ? validAddress(value, "Claim recipient") : account;
    if (Object.values(contracts).some((contract) => contract.address === recipient)) {
      throw new InvalidInputError("Claim recipient cannot be a protocol contract.");
    }
    return recipient;
  }

  async function prepareMarketplaceClaim(input: { account: Address; recipient?: Address }) {
    const account = validAddress(input.account, "Account");
    const recipient = claimRecipient(input.recipient, account);
    const blockNumber = await snapshot();
    const balance = await publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "claimableBalance", args: [account], blockNumber });
    if (balance === 0n) throw new SepbaseError("No marketplace balance is claimable.", "NO_CLAIMABLE_BALANCE", 409);
    return plan({ sender: account, to: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "claimBalance", args: [recipient], blockNumber });
  }

  async function prepareReferralClaim(input: { account: Address; recipient?: Address }) {
    const account = validAddress(input.account, "Account");
    const recipient = claimRecipient(input.recipient, account);
    const blockNumber = await snapshot();
    const balance = await publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "referralBalance", args: [account], blockNumber });
    if (balance === 0n) throw new SepbaseError("No referral balance is claimable.", "NO_REFERRAL_BALANCE", 409);
    return plan({ sender: account, to: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "claimReferralRewards", args: [recipient], blockNumber });
  }

  async function assertTokenOwner(owner: Address, tokenId: bigint, blockNumber: bigint) {
    const current = await publicClient.readContract({ address: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: "ownerOf", args: [tokenId], blockNumber });
    if (getAddress(current) !== owner) throw new InvalidInputError("Account is not the current token owner.");
  }

  async function prepareSetText(input: { owner: Address; label: string; key: string; value: string }) {
    const owner = validAddress(input.owner, "Owner");
    const normalized = canonical(input.label);
    if (!input.key || textBytes(input.key) > MAX_TEXT_KEY_BYTES || textBytes(input.value) > MAX_TEXT_VALUE_BYTES) {
      throw new InvalidInputError("Text record exceeds resolver limits.");
    }
    const blockNumber = await snapshot();
    await assertTokenOwner(owner, normalized.tokenId, blockNumber);
    return plan({ sender: owner, to: contracts.resolver.address, abi: chainNameResolverV3Abi, functionName: "setText", args: [normalized.node, input.key, input.value], blockNumber });
  }

  async function prepareSetAddress(input: { owner: Address; label: string; target: Address }) {
    const owner = validAddress(input.owner, "Owner");
    const target = validAddress(input.target, "Address record", true);
    const normalized = canonical(input.label);
    const blockNumber = await snapshot();
    await assertTokenOwner(owner, normalized.tokenId, blockNumber);
    return plan({ sender: owner, to: contracts.resolver.address, abi: chainNameResolverV3Abi, functionName: "setAddr", args: [normalized.node, target], blockNumber });
  }

  async function prepareSetPrimary(input: { owner: Address; tokenId: bigint }) {
    const owner = validAddress(input.owner, "Owner");
    const blockNumber = await snapshot();
    await assertTokenOwner(owner, input.tokenId, blockNumber);
    return plan({ sender: owner, to: contracts.resolver.address, abi: chainNameResolverV3Abi, functionName: "setPrimaryName", args: [input.tokenId], blockNumber });
  }

  async function prepareClearPrimary(input: { owner: Address }) {
    const owner = validAddress(input.owner, "Owner");
    const blockNumber = await snapshot();
    return plan({
      sender: owner,
      to: contracts.resolver.address,
      abi: chainNameResolverV3Abi,
      functionName: "clearPrimaryName",
      args: [],
      blockNumber,
    });
  }

  async function prepareTransfer(input: { owner: Address; recipient: Address; tokenId: bigint; safe?: boolean }) {
    const owner = validAddress(input.owner, "Owner");
    const recipient = validAddress(input.recipient, "Recipient");
    const blockNumber = await snapshot();
    await assertTokenOwner(owner, input.tokenId, blockNumber);
    return plan({ sender: owner, to: contracts.registry.address, abi: chainNameRegistryV3Abi, functionName: input.safe === false ? "transferFrom" : "safeTransferFrom", args: [owner, recipient, input.tokenId], blockNumber });
  }

  async function prepareMigrationClaim(input: {
    caller: Address;
    legacyLabel: string;
    recipient: Address;
    expectedLegacyOwner: Address;
    importLegacyResolution: boolean;
    expectedLegacyResolution?: Address | null;
  }) {
    const caller = validAddress(input.caller, "Caller");
    const recipient = validAddress(input.recipient, "Recipient");
    const expectedLegacyOwner = validAddress(input.expectedLegacyOwner, "Legacy owner");
    const expectedLegacyResolution = input.expectedLegacyResolution
      ? validAddress(input.expectedLegacyResolution, "Legacy resolution", true)
      : zeroAddress;
    const label = assertLegacyV2MigrationLabel(input.legacyLabel);
    // Prove that the historical ASCII bytes map to the same V3 canonical label
    // without accepting a suffix, case fold, trim, or Unicode transformation.
    canonical(label);
    const blockNumber = await snapshot();
    return plan({ sender: caller, to: contracts.migration.address, abi: chainNameMigrationV3Abi, functionName: "claim", args: [label, recipient, expectedLegacyOwner, input.importLegacyResolution, expectedLegacyResolution], blockNumber });
  }

  async function getMigrationEligibility(
    input: { account: Address; legacyLabel: string },
    blockNumber?: bigint,
  ): Promise<V3MigrationEligibility> {
    const account = validAddress(input.account, "Account");
    const label = assertLegacyV2MigrationLabel(input.legacyLabel);
    const normalized = canonical(label);
    const at = await snapshot(blockNumber);
    let blockTimestamp: bigint;
    let paused: boolean;
    let migrationStartsAt: bigint;
    let migrationEndsAt: bigint;
    let sourceChainId: bigint;
    let legacyRegistry: Address;
    let reserved: boolean;
    let rawStatus: number;
    let legacyExpiresAt: bigint;
    let legacyResolution: Address;
    try {
      const [
        block,
        pausedResult,
        startsResult,
        endsResult,
        sourceChainResult,
        legacyRegistryResult,
        reservedResult,
        statusResult,
        expiryResult,
        resolutionResult,
      ] = await Promise.all([
        publicClient.getBlock({ blockNumber: at }),
        publicClient.readContract({ address: contracts.migration.address, abi: chainNameMigrationV3Abi, functionName: "migrationPaused", blockNumber: at }),
        publicClient.readContract({ address: contracts.migration.address, abi: chainNameMigrationV3Abi, functionName: "migrationStartsAt", blockNumber: at }),
        publicClient.readContract({ address: contracts.migration.address, abi: chainNameMigrationV3Abi, functionName: "migrationEndsAt", blockNumber: at }),
        publicClient.readContract({ address: contracts.migration.address, abi: chainNameMigrationV3Abi, functionName: "sourceChainId", blockNumber: at }),
        publicClient.readContract({ address: contracts.migration.address, abi: chainNameMigrationV3Abi, functionName: "legacyRegistry", blockNumber: at }),
        publicClient.readContract({ address: contracts.migration.address, abi: chainNameMigrationV3Abi, functionName: "isReserved", args: [normalized.tokenId], blockNumber: at }),
        publicClient.readContract({ address: manifest.migration.legacyContract, abi: legacyV2MigrationAbi, functionName: "statusOf", args: [normalized.tokenId], blockNumber: at }),
        publicClient.readContract({ address: manifest.migration.legacyContract, abi: legacyV2MigrationAbi, functionName: "expiresAt", args: [normalized.tokenId], blockNumber: at }),
        publicClient.readContract({ address: manifest.migration.legacyContract, abi: legacyV2MigrationAbi, functionName: "resolvedAddress", args: [normalized.tokenId], blockNumber: at }),
      ]);
      blockTimestamp = block.timestamp;
      paused = pausedResult;
      migrationStartsAt = startsResult;
      migrationEndsAt = endsResult;
      sourceChainId = sourceChainResult;
      legacyRegistry = getAddress(legacyRegistryResult);
      reserved = reservedResult;
      rawStatus = Number(statusResult);
      legacyExpiresAt = expiryResult;
      legacyResolution = getAddress(resolutionResult);
    } catch {
      throw new RpcUnavailableError("The block-pinned v2 migration snapshot could not be verified.");
    }
    if (
      sourceChainId !== BigInt(manifest.migration.sourceChainId)
      || legacyRegistry !== manifest.migration.legacyContract
      || (manifest.migration.startsAt !== null && migrationStartsAt !== BigInt(manifest.migration.startsAt))
      || (manifest.migration.endsAt !== null && migrationEndsAt !== BigInt(manifest.migration.endsAt))
    ) {
      throw new ManifestMismatchError("The live migration policy differs from the verified V3 manifest.");
    }
    const legacyStatus = (["unregistered", "active", "grace", "released"] as const)[rawStatus];
    if (!legacyStatus) throw new ManifestMismatchError("The legacy registry returned an unknown lifecycle state.");
    let legacyOwner: Address | null = null;
    if (legacyStatus === "active" || legacyStatus === "grace") {
      try {
        legacyOwner = getAddress(await publicClient.readContract({
          address: legacyRegistry,
          abi: legacyV2MigrationAbi,
          functionName: "ownerOf",
          args: [normalized.tokenId],
          blockNumber: at,
        }));
      } catch {
        throw new RpcUnavailableError("The block-pinned legacy owner could not be verified.");
      }
    }
    const phase = blockTimestamp < migrationStartsAt
      ? "not-started"
      : blockTimestamp > migrationEndsAt
        ? "closed"
        : paused
          ? "paused"
          : "open";
    if (phase === "open" && (legacyStatus === "active" || legacyStatus === "grace") && !reserved) {
      throw new ManifestMismatchError("An eligible legacy name is not reserved by the live migration policy.");
    }
    const reason = phase !== "open"
      ? phase
      : legacyStatus === "unregistered"
        ? "unregistered"
        : legacyStatus === "released"
          ? "released"
          : legacyOwner !== account
            ? "owner-mismatch"
            : null;
    return {
      account,
      label,
      tokenId: normalized.tokenId,
      blockNumber: at,
      blockTimestamp,
      sourceChainId,
      legacyRegistry,
      migrationStartsAt,
      migrationEndsAt,
      phase,
      legacyStatus,
      legacyOwner,
      legacyExpiresAt,
      legacyResolution,
      reserved,
      eligible: reason === null,
      reason,
    };
  }

  async function getLiabilities(blockNumber?: bigint): Promise<V3Liabilities> {
    const at = await snapshot(blockNumber);
    const [controllerProtectedBalance, referralLiability, marketplaceProtectedBalance, claimableLiability, offerEscrow, auctionEscrow, suiteProtectedBalance, suiteSettlementBalance, controllerSolvent, marketplaceSolvent, suiteSolvent] = await Promise.all([
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "protectedBalance", blockNumber: at }),
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "totalReferralLiability", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "protectedBalance", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "totalClaimableLiability", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "totalOfferEscrow", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "totalAuctionEscrow", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "suiteProtectedBalance", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "suiteSettlementBalance", blockNumber: at }),
      publicClient.readContract({ address: contracts.controller.address, abi: chainNameControllerV3Abi, functionName: "isSolvent", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "isSolvent", blockNumber: at }),
      publicClient.readContract({ address: contracts.marketplace.address, abi: chainNameMarketplaceV3Abi, functionName: "isSuiteSolvent", blockNumber: at }),
    ]);
    return { controllerProtectedBalance, referralLiability, marketplaceProtectedBalance, claimableLiability, offerEscrow, auctionEscrow, suiteProtectedBalance, suiteSettlementBalance, controllerSolvent, marketplaceSolvent, suiteSolvent, blockNumber: at };
  }

  async function reconcileTransaction(transactionPlan: V3TransactionPlan, hash: Hash) {
    assertTransactionPlan(transactionPlan);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: manifest.requiredConfirmations });
    if (receipt.status !== "success") throw new SepbaseError("Transaction reverted.", "TRANSACTION_REVERTED", 409);
    if (receipt.blockNumber <= transactionPlan.blockNumber) {
      throw new ManifestMismatchError("Confirmed transaction predates the prepared V3 plan snapshot.");
    }
    const transaction = await publicClient.getTransaction({ hash });
    if (
      transaction.chainId !== manifest.chainId
      || !transaction.to
      || getAddress(transaction.to) !== transactionPlan.to
      || getAddress(transaction.from) !== transactionPlan.expectedSender
      || transaction.input.toLowerCase() !== transactionPlan.data.toLowerCase()
      || transaction.value !== transactionPlan.value
    ) throw new ManifestMismatchError("Confirmed transaction does not match the prepared V3 plan.");
    return { hash, blockNumber: receipt.blockNumber, status: "success" as const };
  }

  return {
    ...context,
    normalize,
    quoteRegistration,
    prepareRegistrationCommit,
    prepareRegistrationReveal,
    prepareRenew,
    resolveAddress,
    resolveText,
    reverseResolve,
    verifyAddress,
    getNameRecord,
    getOwnedNames,
    getAccountBalances,
    getListings,
    getGlobalOffers: (cursor = 0n, limit = 24, includeTerminal = false, blockNumber?: bigint) => readOffers("global", null, cursor, limit, includeTerminal, blockNumber),
    getBuyerOffers: (buyer, cursor = 0n, limit = 24, includeTerminal = false, blockNumber?: bigint) => readOffers("buyer", buyer, cursor, limit, includeTerminal, blockNumber),
    getOwnerOffers: (owner, cursor = 0n, limit = 24, includeTerminal = false, blockNumber?: bigint) => readOffers("owner", owner, cursor, limit, includeTerminal, blockNumber),
    getAuctions,
    prepareMarketplaceApproval,
    prepareList,
    prepareUpdateListing,
    prepareCancelListing,
    prepareInvalidateListing,
    prepareBuy,
    prepareOffer,
    prepareAcceptOffer,
    prepareCancelOffer,
    prepareInvalidateOffer,
    prepareStartAuction,
    prepareCancelAuction,
    prepareBid,
    prepareFinalizeAuction,
    prepareMarketplaceClaim,
    prepareReferralClaim,
    prepareSetText,
    prepareSetAddress,
    prepareSetPrimary,
    prepareClearPrimary,
    prepareTransfer,
    prepareMigrationClaim,
    getMigrationEligibility,
    getLiabilities,
    assertTransactionPlan,
    reconcileTransaction,
  };
}
