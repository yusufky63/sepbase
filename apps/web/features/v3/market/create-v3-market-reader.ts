import {
  SepbaseError,
  type SepbaseV3Client,
  type V3TransactionPlan,
} from "@sepbase/sdk";
import {
  decodeFunctionData,
  getAddress,
  parseAbi,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import {
  V3MarketUiError,
  type V3MarketActionIntent,
  type V3MarketActionSnapshot,
  type V3MarketGuardMap,
  type V3MarketReadRequest,
  type V3MarketReadResult,
  type V3MarketReaderAdapter,
  type V3SettlementSnapshot,
} from "./types";
import {
  readV3MarketNameContexts,
  requireV3MarketNameContext,
} from "./v3-market-name-context";

const allowanceAbi = parseAbi([
  "function allowance(address owner,address spender) view returns (uint256)",
]);

type TupleRecord = Record<string, unknown>;

function tuple(value: unknown, label: string): TupleRecord {
  if (!value || typeof value !== "object") {
    throw new V3MarketUiError("PLAN_DECODE_FAILED", `${label} calldata is not a tuple.`);
  }
  return value as TupleRecord;
}

function address(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new V3MarketUiError("PLAN_DECODE_FAILED", `${label} is not an address.`);
  }
  try {
    return getAddress(value) as Address;
  } catch {
    throw new V3MarketUiError("PLAN_DECODE_FAILED", `${label} is not a valid address.`);
  }
}

function integer(value: unknown, label: string) {
  if (typeof value !== "bigint") {
    throw new V3MarketUiError("PLAN_DECODE_FAILED", `${label} is not an integer.`);
  }
  return value;
}

function smallInteger(value: unknown, label: string) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  const parsed = integer(value, label);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new V3MarketUiError("PLAN_DECODE_FAILED", `${label} exceeds the UI integer bound.`);
  }
  return Number(parsed);
}

function bytes(value: unknown, label: string) {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new V3MarketUiError("PLAN_DECODE_FAILED", `${label} is not hex data.`);
  }
  return value as Hex;
}

function decodedArgs(client: SepbaseV3Client, plan: V3TransactionPlan) {
  const contract = plan.to.toLowerCase() === client.contracts.controller.address.toLowerCase()
    ? client.contracts.controller
    : plan.to.toLowerCase() === client.contracts.registry.address.toLowerCase()
      ? client.contracts.registry
      : client.contracts.marketplace;
  const decoded = decodeFunctionData({ abi: contract.abi, data: plan.data });
  if (decoded.functionName !== plan.functionName || !decoded.args) {
    throw new V3MarketUiError("PLAN_DECODE_FAILED", "The SDK plan selector does not match its function metadata.");
  }
  return decoded.args as readonly unknown[];
}

function guardsFromPlan<K extends V3MarketActionIntent["kind"]>(
  client: SepbaseV3Client,
  intent: Extract<V3MarketActionIntent, { kind: K }>,
  plan: V3TransactionPlan,
): V3MarketGuardMap[K] {
  const args = decodedArgs(client, plan);

  switch (intent.kind) {
    case "marketplace-approve":
      return {
        tokenId: integer(args[1], "Token ID"),
        expectedOwner: plan.expectedSender,
        marketplace: address(args[0], "Marketplace"),
      } as V3MarketGuardMap[K];
    case "fixed-list": {
      const request = tuple(args[0], "List request");
      return {
        expectedSeller: plan.expectedSender,
        expectedTransferNonce: integer(request.expectedTransferNonce, "Expected transfer nonce"),
        expectedFeeBps: smallInteger(request.expectedFeeBps, "Expected fee"),
      } as V3MarketGuardMap[K];
    }
    case "fixed-update":
      return {
        expectedSeller: plan.expectedSender,
        expectedPrice: integer(args[1], "Expected price"),
        expectedDeadline: integer(args[2], "Expected deadline"),
        expectedTransferNonce: integer(args[3], "Expected transfer nonce"),
        expectedListingNonce: integer(args[4], "Expected listing nonce"),
        expectedFeeBps: smallInteger(args[5], "Expected listing fee"),
        expectedCurrentFeeBps: smallInteger(args[8], "Expected current fee"),
      } as V3MarketGuardMap[K];
    case "fixed-cancel":
      return {
        expectedSeller: plan.expectedSender,
        expectedPrice: integer(args[1], "Expected price"),
        expectedDeadline: integer(args[2], "Expected deadline"),
        expectedTransferNonce: integer(args[3], "Expected transfer nonce"),
        expectedListingNonce: integer(args[4], "Expected listing nonce"),
        expectedFeeBps: smallInteger(args[5], "Expected fee"),
      } as V3MarketGuardMap[K];
    case "fixed-invalidate":
      return { tokenId: integer(args[0], "Token ID") } as V3MarketGuardMap[K];
    case "fixed-buy": {
      const request = tuple(args[0], "Buy request");
      return {
        expectedSeller: address(request.expectedSeller, "Expected seller"),
        expectedRecipient: address(request.recipient, "Expected recipient"),
        expectedPrice: integer(request.expectedPrice, "Expected price"),
        expectedDeadline: integer(request.expectedDeadline, "Expected deadline"),
        expectedListingNonce: integer(request.expectedListingNonce, "Expected listing nonce"),
        expectedFeeBps: smallInteger(request.expectedFeeBps, "Expected fee"),
      } as V3MarketGuardMap[K];
    }
    case "offer-create": {
      const request = tuple(args[0], "Offer request");
      return {
        expectedOwner: address(request.expectedOwner, "Expected owner"),
        expectedTransferNonce: integer(request.expectedTransferNonce, "Expected transfer nonce"),
        expectedFeeBps: smallInteger(request.expectedFeeBps, "Expected fee"),
      } as V3MarketGuardMap[K];
    }
    case "offer-cancel":
      return {
        offerId: bytes(args[0], "Offer ID"),
        expectedAmount: integer(args[1], "Expected amount"),
        expectedDeadline: integer(args[2], "Expected deadline"),
        expectedFeeBps: smallInteger(args[3], "Expected fee"),
      } as V3MarketGuardMap[K];
    case "offer-accept": {
      const request = tuple(args[0], "Accept offer request");
      return {
        offerId: bytes(request.offerId, "Offer ID"),
        expectedBuyer: address(request.expectedBuyer, "Expected buyer"),
        expectedRecipient: address(request.expectedRecipient, "Expected recipient"),
        expectedAmount: integer(request.expectedAmount, "Expected amount"),
        expectedDeadline: integer(request.expectedDeadline, "Expected deadline"),
        expectedFeeBps: smallInteger(request.expectedFeeBps, "Expected fee"),
      } as V3MarketGuardMap[K];
    }
    case "offer-invalidate":
      return { offerId: bytes(args[0], "Offer ID") } as V3MarketGuardMap[K];
    case "auction-create": {
      const request = tuple(args[0], "Start auction request");
      return {
        expectedSeller: plan.expectedSender,
        expectedTransferNonce: integer(request.expectedTransferNonce, "Expected transfer nonce"),
        expectedFeeBps: smallInteger(request.expectedFeeBps, "Expected fee"),
        expectedEndAt: integer(request.endAt, "Expected end time"),
      } as V3MarketGuardMap[K];
    }
    case "auction-bid": {
      const request = tuple(args[0], "Bid request");
      return {
        expectedHighestBidder: address(request.expectedHighestBidder, "Expected highest bidder"),
        expectedHighestBidRecipient: address(request.expectedHighestBidRecipient, "Expected bid recipient"),
        expectedHighestBid: integer(request.expectedHighestBid, "Expected highest bid"),
        expectedEndAt: integer(request.expectedEndAt, "Expected end time"),
        expectedAuctionNonce: integer(request.expectedAuctionNonce, "Expected auction nonce"),
        expectedFeeBps: smallInteger(request.expectedFeeBps, "Expected fee"),
      } as V3MarketGuardMap[K];
    }
    case "auction-cancel":
      return {
        expectedSeller: plan.expectedSender,
        expectedReservePrice: integer(args[1], "Expected reserve price"),
        expectedEndAt: integer(args[2], "Expected end time"),
        expectedAuctionNonce: integer(args[3], "Expected auction nonce"),
        expectedFeeBps: smallInteger(args[4], "Expected fee"),
      } as V3MarketGuardMap[K];
    case "auction-finalize": {
      const request = tuple(args[0], "Finalize auction request");
      return {
        expectedHighestBidder: address(request.expectedHighestBidder, "Expected highest bidder"),
        expectedHighestBidRecipient: address(request.expectedHighestBidRecipient, "Expected bid recipient"),
        expectedHighestBid: integer(request.expectedHighestBid, "Expected highest bid"),
        expectedEndAt: integer(request.expectedEndAt, "Expected end time"),
        expectedAuctionNonce: integer(request.expectedAuctionNonce, "Expected auction nonce"),
        expectedFeeBps: smallInteger(request.expectedFeeBps, "Expected fee"),
      } as V3MarketGuardMap[K];
    }
    case "claim":
      throw new V3MarketUiError("PLAN_DECODE_FAILED", "Claim guards require a pinned balance read.");
    default:
      throw new V3MarketUiError("ACTION_UNSUPPORTED", "Unsupported market action.");
  }
}

export function prepareV3MarketIntent(
  client: SepbaseV3Client,
  intent: V3MarketActionIntent,
  account: Address,
) {
  switch (intent.kind) {
    case "marketplace-approve":
      return client.prepareMarketplaceApproval({ owner: account, tokenId: intent.tokenId });
    case "fixed-list":
      return client.prepareList({ seller: account, tokenId: intent.tokenId, price: intent.price, deadline: intent.deadline });
    case "fixed-update":
      return client.prepareUpdateListing({ seller: account, tokenId: intent.tokenId, newPrice: intent.newPrice, newDeadline: intent.newDeadline });
    case "fixed-cancel":
      return client.prepareCancelListing({ seller: account, tokenId: intent.tokenId });
    case "fixed-invalidate":
      return client.prepareInvalidateListing({ caller: account, tokenId: intent.tokenId });
    case "fixed-buy":
      return client.prepareBuy({ buyer: account, tokenId: intent.tokenId, recipient: intent.recipient });
    case "offer-create":
      return client.prepareOffer({ buyer: account, tokenId: intent.tokenId, recipient: intent.recipient, amount: intent.amount, deadline: intent.deadline });
    case "offer-cancel":
      return client.prepareCancelOffer({ buyer: account, offerId: intent.offerId });
    case "offer-accept":
      return client.prepareAcceptOffer({ seller: account, offerId: intent.offerId });
    case "offer-invalidate":
      return client.prepareInvalidateOffer({ caller: account, offerId: intent.offerId });
    case "auction-create":
      return client.prepareStartAuction({ seller: account, tokenId: intent.tokenId, reservePrice: intent.reservePrice, startAt: intent.startAt, endAt: intent.endAt });
    case "auction-bid":
      return client.prepareBid({ bidder: account, tokenId: intent.tokenId, recipient: intent.recipient, amount: intent.amount });
    case "auction-cancel":
      return client.prepareCancelAuction({ seller: account, tokenId: intent.tokenId });
    case "auction-finalize":
      return client.prepareFinalizeAuction({ caller: account, tokenId: intent.tokenId });
    case "claim":
      return intent.claimKind === "referral"
        ? client.prepareReferralClaim({ account, recipient: intent.recipient })
        : client.prepareMarketplaceClaim({ account, recipient: intent.recipient });
    default: {
      const exhaustive: never = intent;
      throw new V3MarketUiError("ACTION_UNSUPPORTED", `Unsupported market action: ${String(exhaustive)}`);
    }
  }
}

function settlement(client: SepbaseV3Client): V3SettlementSnapshot {
  return {
    kind: client.manifest.settlement.kind,
    tokenAddress: client.manifest.settlement.tokenAddress,
    symbol: client.manifest.settlement.symbol,
    decimals: client.manifest.settlement.decimals,
  };
}

function flow(intent: V3MarketActionIntent) {
  if (intent.kind === "fixed-buy" || intent.kind === "offer-create" || intent.kind === "auction-bid") {
    return "collect" as const;
  }
  if (intent.kind === "claim") return "payout" as const;
  return "none" as const;
}

function planAmount(plan: V3TransactionPlan) {
  return plan.settlementApproval?.amount ?? plan.value;
}

async function tokenForOffer(
  client: SepbaseV3Client,
  offerId: Hex,
  blockNumber: bigint,
) {
  const offer = await client.publicClient.readContract({
    address: client.contracts.marketplace.address,
    abi: client.contracts.marketplace.abi,
    functionName: "offers",
    args: [offerId],
    blockNumber,
  }) as readonly unknown[];
  return integer(offer[0], "Offer token ID");
}

async function tokenForIntent(
  client: SepbaseV3Client,
  intent: Exclude<V3MarketActionIntent, { kind: "claim" }>,
  blockNumber: bigint,
) {
  if ("tokenId" in intent) return intent.tokenId;
  return tokenForOffer(client, intent.offerId, blockNumber);
}

async function nftApprovalAt(
  client: SepbaseV3Client,
  owner: Address,
  tokenId: bigint,
  blockNumber: bigint,
) {
  const [currentOwner, currentApproved, approvedForAll] = await Promise.all([
    client.publicClient.readContract({
      address: client.contracts.registry.address,
      abi: client.contracts.registry.abi,
      functionName: "ownerOf",
      args: [tokenId],
      blockNumber,
    }),
    client.publicClient.readContract({
      address: client.contracts.registry.address,
      abi: client.contracts.registry.abi,
      functionName: "getApproved",
      args: [tokenId],
      blockNumber,
    }),
    client.publicClient.readContract({
      address: client.contracts.registry.address,
      abi: client.contracts.registry.abi,
      functionName: "isApprovedForAll",
      args: [owner, client.contracts.marketplace.address],
      blockNumber,
    }),
  ]);
  if (address(currentOwner, "Current owner").toLowerCase() !== owner.toLowerCase()) {
    throw new V3MarketUiError("OWNER_CHANGED", "The connected account is no longer the current token owner.");
  }
  const approved = address(currentApproved, "Current approved operator");
  const operatorApproved = approved.toLowerCase() === client.contracts.marketplace.address.toLowerCase();
  return {
    required: !operatorApproved && approvedForAll !== true,
    registry: client.contracts.registry.address,
    marketplace: client.contracts.marketplace.address,
    tokenId,
    currentApproved: approved ?? zeroAddress,
    approvedForAll: approvedForAll === true,
  };
}

async function nftApprovalForIntent(
  client: SepbaseV3Client,
  intent: V3MarketActionIntent,
  owner: Address,
  tokenId: bigint,
  blockNumber: bigint,
) {
  if (
    intent.kind === "marketplace-approve"
    || intent.kind === "fixed-list"
    || intent.kind === "auction-create"
  ) {
    return nftApprovalAt(client, owner, tokenId, blockNumber);
  }
  if (intent.kind === "offer-accept") {
    return nftApprovalAt(client, owner, tokenId, blockNumber);
  }
  return null;
}

async function allowanceFor(client: SepbaseV3Client, plan: V3TransactionPlan) {
  if (!plan.settlementApproval) return null;
  const approval = plan.settlementApproval;
  const currentAllowance = await client.publicClient.readContract({
    address: approval.token,
    abi: allowanceAbi,
    functionName: "allowance",
    args: [plan.expectedSender, approval.spender],
    blockNumber: plan.blockNumber,
  });
  return {
    required: currentAllowance < approval.amount,
    token: approval.token,
    spender: approval.spender,
    amount: approval.amount,
    currentAllowance,
  };
}

async function snapshotForPlan(
  client: SepbaseV3Client,
  request: V3MarketReadRequest,
  plan: V3TransactionPlan,
): Promise<V3MarketActionSnapshot> {
  if (
    plan.suiteReleaseId !== request.release.suiteReleaseId
    || plan.chainId !== request.release.chainId
    || plan.expectedSender.toLowerCase() !== request.account.toLowerCase()
  ) {
    throw new V3MarketUiError("PLAN_SCOPE_MISMATCH", "The SDK plan does not match the requested release, chain or sender.");
  }

  if (request.intent.kind === "claim") {
    const balances = await client.getAccountBalances(request.account, plan.blockNumber);
    const claimArgs = decodedArgs(client, plan);
    const expectedAmount = request.intent.claimKind === "referral"
      ? balances.referralRewards
      : balances.marketplaceClaimable;
    return {
      kind: "claim",
      suiteReleaseId: request.release.suiteReleaseId,
      chainId: request.release.chainId,
      blockNumber: plan.blockNumber,
      expectedSender: request.account,
      objectStatus: request.intent.claimKind === "referral" ? "REFERRAL CREDIT" : "UNIFIED MARKETPLACE CREDIT",
      stale: false,
      permission: { allowed: true, reason: null },
      settlement: settlement(client),
      settlementFlow: "payout",
      settlementAmount: expectedAmount,
      approval: null,
      nftApproval: null,
      nameContext: null,
      guards: {
        claimant: request.account,
        claimKind: request.intent.claimKind,
        expectedRecipient: address(claimArgs[0], "Claim recipient"),
        expectedAmount,
      },
    };
  }

  const intent = request.intent;
  const actionTokenId = await tokenForIntent(client, intent, plan.blockNumber);
  const nameContexts = await readV3MarketNameContexts(client, [actionTokenId], plan.blockNumber, 1);
  const nameContext = requireV3MarketNameContext(nameContexts, actionTokenId);
  const nftApproval = await nftApprovalForIntent(
    client,
    intent,
    request.account,
    actionTokenId,
    plan.blockNumber,
  );
  const approvalBlocked = intent.kind !== "marketplace-approve" && nftApproval?.required === true;
  return {
    kind: intent.kind,
    suiteReleaseId: request.release.suiteReleaseId,
    chainId: request.release.chainId,
    blockNumber: plan.blockNumber,
    expectedSender: request.account,
    objectStatus: intent.kind === "fixed-invalidate" || intent.kind === "offer-invalidate"
      ? "STALE / INVALIDATABLE"
      : "GUARDS VERIFIED",
    stale: intent.kind === "fixed-invalidate" || intent.kind === "offer-invalidate",
    permission: {
      allowed: !approvalBlocked,
      reason: approvalBlocked
        ? "Approve this individual token for the verified marketplace before preparing the market action."
        : null,
    },
    settlement: settlement(client),
    settlementFlow: flow(intent),
    settlementAmount: flow(intent) === "collect" ? planAmount(plan) : 0n,
    approval: await allowanceFor(client, plan),
    nftApproval,
    nameContext,
    guards: guardsFromPlan(client, intent, plan),
  } as V3MarketActionSnapshot;
}

async function zeroClaimSnapshot(
  client: SepbaseV3Client,
  request: V3MarketReadRequest & { intent: Extract<V3MarketActionIntent, { kind: "claim" }> },
) {
  const blockNumber = await client.publicClient.getBlockNumber();
  const balances = await client.getAccountBalances(request.account, blockNumber);
  const expectedAmount = request.intent.claimKind === "referral"
    ? balances.referralRewards
    : balances.marketplaceClaimable;
  return {
    kind: "claim",
    suiteReleaseId: request.release.suiteReleaseId,
    chainId: request.release.chainId,
    blockNumber,
    expectedSender: request.account,
    objectStatus: request.intent.claimKind === "referral" ? "REFERRAL CREDIT" : "UNIFIED MARKETPLACE CREDIT",
    stale: false,
    permission: { allowed: true, reason: null },
    settlement: settlement(client),
    settlementFlow: "payout",
    settlementAmount: expectedAmount,
    approval: null,
    nftApproval: null,
    nameContext: null,
    guards: {
      claimant: request.account,
      claimKind: request.intent.claimKind,
      expectedRecipient: request.intent.recipient,
      expectedAmount,
    },
  } satisfies V3MarketActionSnapshot<"claim">;
}

function safeReadError(error: unknown): V3MarketReadResult {
  if (error instanceof SepbaseError) {
    return { status: "unavailable", code: error.code, message: error.message, blockNumber: null };
  }
  if (error instanceof V3MarketUiError) {
    return { status: "unavailable", code: error.code, message: error.message, blockNumber: null };
  }
  return {
    status: "unavailable",
    code: "MARKET_READ_UNAVAILABLE",
    message: "The verified V3 reader could not produce a block-pinned market snapshot.",
    blockNumber: null,
  };
}

function canonical(value: unknown): string {
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${key}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function economicScope(snapshot: V3MarketActionSnapshot) {
  return {
    kind: snapshot.kind,
    suiteReleaseId: snapshot.suiteReleaseId,
    chainId: snapshot.chainId,
    expectedSender: snapshot.expectedSender.toLowerCase(),
    guards: snapshot.guards,
    settlement: {
      kind: snapshot.settlement.kind,
      tokenAddress: snapshot.settlement.tokenAddress?.toLowerCase() ?? null,
      decimals: snapshot.settlement.decimals,
    },
    settlementFlow: snapshot.settlementFlow,
    settlementAmount: snapshot.settlementAmount,
    approval: snapshot.approval
      ? {
        token: snapshot.approval.token.toLowerCase(),
        spender: snapshot.approval.spender.toLowerCase(),
        amount: snapshot.approval.amount,
      }
      : null,
    nftApproval: snapshot.nftApproval
      ? {
        required: snapshot.nftApproval.required,
        registry: snapshot.nftApproval.registry.toLowerCase(),
        marketplace: snapshot.nftApproval.marketplace.toLowerCase(),
        tokenId: snapshot.nftApproval.tokenId,
        currentApproved: snapshot.nftApproval.currentApproved.toLowerCase(),
        approvedForAll: snapshot.nftApproval.approvedForAll,
      }
      : null,
    nameContext: snapshot.nameContext
      ? {
        tokenId: snapshot.nameContext.tokenId,
        label: snapshot.nameContext.label,
        fullName: snapshot.nameContext.fullName,
        lifecycle: snapshot.nameContext.lifecycle,
        expiresAt: snapshot.nameContext.expiresAt,
      }
      : null,
  };
}

export function createV3MarketReader(client: SepbaseV3Client): V3MarketReaderAdapter {
  return {
    async readAction(request) {
      try {
        const plan = await prepareV3MarketIntent(client, request.intent, request.account);
        return { status: "ready", snapshot: await snapshotForPlan(client, request, plan) };
      } catch (error) {
        if (
          request.intent.kind === "claim"
          && error instanceof SepbaseError
          && (error.code === "NO_CLAIMABLE_BALANCE" || error.code === "NO_REFERRAL_BALANCE")
        ) {
          try {
            return { status: "ready", snapshot: await zeroClaimSnapshot(client, request as V3MarketReadRequest & { intent: Extract<V3MarketActionIntent, { kind: "claim" }> }) };
          } catch (zeroError) {
            return safeReadError(zeroError);
          }
        }
        return safeReadError(error);
      }
    },

    async prepareAction(request, reviewedSnapshot) {
      const plan = await prepareV3MarketIntent(client, request.intent, request.account);
      const freshSnapshot = await snapshotForPlan(client, request, plan);
      if (canonical(economicScope(freshSnapshot)) !== canonical(economicScope(reviewedSnapshot))) {
        throw new V3MarketUiError(
          "GUARDS_CHANGED",
          "Price, fee, nonce, recipient, highest bid, balance or deadline changed. Review a new snapshot.",
        );
      }
      return plan;
    },
  };
}
