import type { SepbaseV3Client, V3TransactionPlan } from "@sepbase/sdk";
import type { V3PlanExecutionAdapter } from "@/lib/v3-plan-executor";
import type { V3MarketNameContext } from "./v3-market-name-context";

export type V3Address = `0x${string}`;
export type V3Hex = `0x${string}`;
export type V3SuiteReleaseId = `sha256:${string}`;
export type V3ReleaseStatus = "draft" | "candidate" | "live";

export type V3MarketActionKind =
  | "marketplace-approve"
  | "fixed-list"
  | "fixed-update"
  | "fixed-cancel"
  | "fixed-invalidate"
  | "fixed-buy"
  | "offer-create"
  | "offer-cancel"
  | "offer-accept"
  | "offer-invalidate"
  | "auction-create"
  | "auction-bid"
  | "auction-cancel"
  | "auction-finalize"
  | "claim";

export type V3ClaimKind =
  | "referral"
  | "seller-proceeds"
  | "offer-refund"
  | "outbid-refund"
  | "auction-refund";

export type V3MarketActionIntent =
  | { kind: "marketplace-approve"; tokenId: bigint }
  | { kind: "fixed-list"; tokenId: bigint; price: bigint; deadline: bigint }
  | { kind: "fixed-update"; tokenId: bigint; newPrice: bigint; newDeadline: bigint }
  | { kind: "fixed-cancel"; tokenId: bigint }
  | { kind: "fixed-invalidate"; tokenId: bigint }
  | { kind: "fixed-buy"; tokenId: bigint; recipient: V3Address }
  | { kind: "offer-create"; tokenId: bigint; recipient: V3Address; amount: bigint; deadline: bigint }
  | { kind: "offer-cancel"; offerId: V3Hex }
  | { kind: "offer-accept"; offerId: V3Hex }
  | { kind: "offer-invalidate"; offerId: V3Hex }
  | { kind: "auction-create"; tokenId: bigint; reservePrice: bigint; startAt: bigint; endAt: bigint }
  | { kind: "auction-bid"; tokenId: bigint; amount: bigint; recipient: V3Address }
  | { kind: "auction-cancel"; tokenId: bigint }
  | { kind: "auction-finalize"; tokenId: bigint }
  | { kind: "claim"; claimKind: V3ClaimKind; recipient: V3Address };

export type V3ListingGuards = {
  expectedSeller: V3Address;
  expectedPrice: bigint;
  expectedDeadline: bigint;
  expectedTransferNonce: bigint;
  expectedListingNonce: bigint;
  expectedFeeBps: number;
};

export type V3OfferGuards = {
  offerId: V3Hex;
  expectedOwner: V3Address;
  expectedBuyer: V3Address;
  expectedRecipient: V3Address;
  expectedAmount: bigint;
  expectedDeadline: bigint;
  expectedTransferNonce: bigint;
  expectedFeeBps: number;
};

export type V3AuctionGuards = {
  expectedSeller: V3Address;
  expectedHighestBidder: V3Address;
  expectedHighestBidRecipient: V3Address;
  expectedHighestBid: bigint;
  expectedEndAt: bigint;
  expectedAuctionNonce: bigint;
  expectedFeeBps: number;
};

export type V3MarketGuardMap = {
  "marketplace-approve": {
    tokenId: bigint;
    expectedOwner: V3Address;
    marketplace: V3Address;
  };
  "fixed-list": Pick<V3ListingGuards, "expectedSeller" | "expectedTransferNonce" | "expectedFeeBps">;
  "fixed-update": V3ListingGuards & { expectedCurrentFeeBps: number };
  "fixed-cancel": V3ListingGuards;
  "fixed-invalidate": { tokenId: bigint };
  "fixed-buy": Omit<V3ListingGuards, "expectedTransferNonce"> & { expectedRecipient: V3Address };
  "offer-create": Pick<V3OfferGuards, "expectedOwner" | "expectedTransferNonce" | "expectedFeeBps">;
  "offer-cancel": Pick<V3OfferGuards, "offerId" | "expectedAmount" | "expectedDeadline" | "expectedFeeBps">;
  "offer-accept": Pick<V3OfferGuards, "offerId" | "expectedBuyer" | "expectedRecipient" | "expectedAmount" | "expectedDeadline" | "expectedFeeBps">;
  "offer-invalidate": Pick<V3OfferGuards, "offerId">;
  "auction-create": {
    expectedSeller: V3Address;
    expectedTransferNonce: bigint;
    expectedFeeBps: number;
    expectedEndAt: bigint;
  };
  "auction-bid": Omit<V3AuctionGuards, "expectedSeller">;
  "auction-cancel": {
    expectedSeller: V3Address;
    expectedReservePrice: bigint;
    expectedEndAt: bigint;
    expectedAuctionNonce: bigint;
    expectedFeeBps: number;
  };
  "auction-finalize": Omit<V3AuctionGuards, "expectedSeller">;
  claim: {
    claimant: V3Address;
    claimKind: V3ClaimKind;
    expectedRecipient: V3Address;
    expectedAmount: bigint;
  };
};

export type V3ReleaseContext = {
  status: V3ReleaseStatus;
  suiteReleaseId: V3SuiteReleaseId;
  chainId: number;
  requiredConfirmations: number;
};

export type V3SettlementSnapshot = {
  kind: "native" | "erc20";
  tokenAddress: V3Address | null;
  symbol: string;
  decimals: number;
};

export type V3ApprovalRequirement = {
  required: boolean;
  token: V3Address;
  spender: V3Address;
  amount: bigint;
  currentAllowance: bigint;
};

export type V3NftApprovalRequirement = {
  required: boolean;
  registry: V3Address;
  marketplace: V3Address;
  tokenId: bigint;
  currentApproved: V3Address;
  approvedForAll: boolean;
};

export type V3PermissionSnapshot = {
  allowed: boolean;
  reason: string | null;
};

type V3SnapshotBase = {
  suiteReleaseId: V3SuiteReleaseId;
  chainId: number;
  blockNumber: bigint;
  expectedSender: V3Address;
  objectStatus: string;
  stale: boolean;
  permission: V3PermissionSnapshot;
  settlement: V3SettlementSnapshot;
  settlementFlow: "collect" | "payout" | "none";
  settlementAmount: bigint;
  approval: V3ApprovalRequirement | null;
  nftApproval: V3NftApprovalRequirement | null;
  nameContext: V3MarketNameContext | null;
};

export type V3MarketActionSnapshot<K extends V3MarketActionKind = V3MarketActionKind> = {
  [P in K]: V3SnapshotBase & {
    kind: P;
    guards: V3MarketGuardMap[P];
  }
}[K];

export type V3MarketReadResult =
  | { status: "ready"; snapshot: V3MarketActionSnapshot }
  | { status: "unavailable"; code: string; message: string; blockNumber: bigint | null };

export type V3MarketReadRequest = {
  intent: V3MarketActionIntent;
  account: V3Address;
  release: V3ReleaseContext;
};

export interface V3MarketReaderAdapter {
  readAction(request: V3MarketReadRequest): Promise<V3MarketReadResult>;
  prepareAction(
    request: V3MarketReadRequest,
    reviewedSnapshot: V3MarketActionSnapshot,
  ): Promise<V3TransactionPlan>;
}

export type V3MarketExecutionContext = {
  client: SepbaseV3Client;
  adapter: V3PlanExecutionAdapter;
};

export class V3MarketUiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "V3MarketUiError";
    this.code = code;
  }
}

export const V3_MARKET_ACTION_COPY: Record<
  V3MarketActionKind,
  { group: "FIXED" | "OFFER" | "AUCTION" | "ACCOUNT"; title: string; executeLabel: string }
> = {
  "marketplace-approve": { group: "ACCOUNT", title: "Enable one name for the market", executeLabel: "Enable market actions" },
  "fixed-list": { group: "FIXED", title: "List name", executeLabel: "List name" },
  "fixed-update": { group: "FIXED", title: "Update listing", executeLabel: "Save changes" },
  "fixed-cancel": { group: "FIXED", title: "Cancel listing", executeLabel: "Cancel listing" },
  "fixed-invalidate": { group: "FIXED", title: "Refresh listing", executeLabel: "Refresh listing" },
  "fixed-buy": { group: "FIXED", title: "Buy listed name", executeLabel: "Buy name" },
  "offer-create": { group: "OFFER", title: "Make an offer", executeLabel: "Make offer" },
  "offer-cancel": { group: "OFFER", title: "Cancel offer", executeLabel: "Cancel offer" },
  "offer-accept": { group: "OFFER", title: "Accept offer", executeLabel: "Accept offer" },
  "offer-invalidate": { group: "OFFER", title: "Refresh offer", executeLabel: "Refresh offer" },
  "auction-create": { group: "AUCTION", title: "Create auction", executeLabel: "Create auction" },
  "auction-bid": { group: "AUCTION", title: "Place a bid", executeLabel: "Place bid" },
  "auction-cancel": { group: "AUCTION", title: "Cancel auction", executeLabel: "Cancel auction" },
  "auction-finalize": { group: "AUCTION", title: "Finish auction", executeLabel: "Finish auction" },
  claim: { group: "ACCOUNT", title: "Claim your balance", executeLabel: "Claim balance" },
};

export function v3MarketIntentKey(intent: V3MarketActionIntent) {
  return Object.entries(intent)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|");
}
