import { describe, expect, it, vi } from "vitest";
import type { SepbaseV3Client, V3TransactionPlan } from "@sepbase/sdk";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import {
  createV3MarketReader,
  prepareV3MarketIntent,
} from "./create-v3-market-reader";
import type { V3MarketActionIntent, V3MarketReadRequest } from "./types";

const account = "0x1111111111111111111111111111111111111111" as Address;
const seller = "0x2222222222222222222222222222222222222222" as Address;
const recipient = "0x3333333333333333333333333333333333333333" as Address;
const marketplace = "0x4444444444444444444444444444444444444444" as Address;
const registry = "0x5555555555555555555555555555555555555555" as Address;
const controller = "0x6666666666666666666666666666666666666666" as Address;
const settlementToken = "0x7777777777777777777777777777777777777777" as Address;
const suiteReleaseId = `sha256:${"a".repeat(64)}` as const;
const offerId = `0x${"ab".repeat(32)}` as const;

const marketplaceAbi = parseAbi([
  "function buyName((uint256 tokenId,address expectedSeller,address recipient,uint256 expectedPrice,uint64 expectedDeadline,uint64 expectedListingNonce,uint16 expectedFeeBps) request) payable",
]);
const registryAbi = parseAbi([
  "function approve(address to,uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner,address operator) view returns (bool)",
  "function labelOf(uint256 tokenId) view returns (string)",
  "function fullName(uint256 tokenId) view returns (string)",
  "function statusOf(uint256 tokenId) view returns (uint8)",
  "function expiresAt(uint256 tokenId) view returns (uint64)",
]);
const controllerAbi = parseAbi(["function claimReferralRewards(address recipient)"]);

function buyPlan(price: bigint): V3TransactionPlan {
  return {
    suiteReleaseId,
    chainId: 84_532,
    expectedSender: account,
    to: marketplace,
    data: encodeFunctionData({
      abi: marketplaceAbi,
      functionName: "buyName",
      args: [{
        tokenId: 42n,
        expectedSeller: seller,
        recipient,
        expectedPrice: price,
        expectedDeadline: 2_000_000_000n,
        expectedListingNonce: 9n,
        expectedFeeBps: 125,
      }],
    }),
    value: 0n,
    functionName: "buyName",
    blockNumber: 900n,
    settlementApproval: {
      token: settlementToken,
      spender: marketplace,
      amount: price,
      data: "0x1234",
    },
  };
}

function fixedBuyClient(...plans: V3TransactionPlan[]) {
  const prepareBuy = vi.fn(async () => plans.shift() ?? buyPlan(1_250_000n));
  const readValue = async ({ functionName }: { functionName: string }) => {
    if (functionName === "allowance") return 0n;
    if (functionName === "labelOf") return "alice";
    if (functionName === "fullName") return "alice.base";
    if (functionName === "statusOf") return 1;
    if (functionName === "expiresAt") return 2_100_000_000n;
    throw new Error(`Unexpected read: ${functionName}`);
  };
  const readContract = vi.fn(readValue);
  const multicall = vi.fn(async ({ contracts }: { contracts: readonly { functionName: string }[] }) =>
    Promise.all(contracts.map(({ functionName }) => readValue({ functionName }))));
  return {
    client: {
      manifest: {
        suiteReleaseId,
        chainId: 84_532,
        settlement: { kind: "erc20", tokenAddress: settlementToken, symbol: "USDC", decimals: 6 },
      },
      contracts: {
        marketplace: { address: marketplace, abi: marketplaceAbi },
        registry: { address: registry, abi: registryAbi },
        controller: { address: controller, abi: controllerAbi },
      },
      publicClient: { readContract, multicall },
      prepareBuy,
    } as unknown as SepbaseV3Client,
    prepareBuy,
  };
}

const fixedBuyRequest: V3MarketReadRequest = {
  account,
  release: {
    status: "candidate",
    suiteReleaseId,
    chainId: 84_532,
    requiredConfirmations: 5,
  },
  intent: { kind: "fixed-buy", tokenId: 42n, recipient },
};

describe("createV3MarketReader", () => {
  it("decodes SDK calldata into reviewed guards and exact ERC-20 approval", async () => {
    const { client } = fixedBuyClient(buyPlan(1_250_000n));
    const result = await createV3MarketReader(client).readAction(fixedBuyRequest);

    if (result.status === "unavailable") throw new Error(`${result.code}: ${result.message}`);
    expect(result).toMatchObject({ status: "ready" });
    expect(result.snapshot.blockNumber).toBe(900n);
    expect(result.snapshot.nameContext).toEqual({
      tokenId: 42n,
      label: "alice",
      fullName: "alice.base",
      lifecycle: "active",
      expiresAt: 2_100_000_000n,
      blockNumber: 900n,
    });
    expect(result.snapshot.guards).toEqual({
      expectedSeller: seller,
      expectedRecipient: recipient,
      expectedPrice: 1_250_000n,
      expectedDeadline: 2_000_000_000n,
      expectedListingNonce: 9n,
      expectedFeeBps: 125,
    });
    expect(result.snapshot.approval).toMatchObject({
      required: true,
      amount: 1_250_000n,
      currentAllowance: 0n,
      token: settlementToken,
      spender: marketplace,
    });
  });

  it("rejects a fresh plan when an economic guard changed after review", async () => {
    const { client } = fixedBuyClient(buyPlan(1_250_000n), buyPlan(1_500_000n));
    const reader = createV3MarketReader(client);
    const result = await reader.readAction(fixedBuyRequest);
    if (result.status === "unavailable") throw new Error(`${result.code}: ${result.message}`);
    expect(result).toMatchObject({ status: "ready" });

    await expect(reader.prepareAction(fixedBuyRequest, result.snapshot)).rejects.toMatchObject({
      code: "GUARDS_CHANGED",
    });
  });

  it("binds lifecycle and name context to the review while allowing a newer pinned block", async () => {
    const firstPlan = buyPlan(1_250_000n);
    const secondPlan = { ...buyPlan(1_250_000n), blockNumber: 901n };
    const { client } = fixedBuyClient(firstPlan, secondPlan);
    let statusReads = 0;
    const readValue = async ({ functionName }: { functionName: string }) => {
      if (functionName === "allowance") return 0n;
      if (functionName === "labelOf") return "alice";
      if (functionName === "fullName") return "alice.base";
      if (functionName === "statusOf") return statusReads++ === 0 ? 1 : 2;
      if (functionName === "expiresAt") return 2_100_000_000n;
      throw new Error(`Unexpected read: ${functionName}`);
    };
    client.publicClient.readContract = vi.fn(readValue) as never;
    client.publicClient.multicall = vi.fn(async ({ contracts }: { contracts: readonly { functionName: string }[] }) =>
      Promise.all(contracts.map(({ functionName }) => readValue({ functionName })))) as never;
    const reader = createV3MarketReader(client);
    const result = await reader.readAction(fixedBuyRequest);
    if (result.status === "unavailable") throw new Error(`${result.code}: ${result.message}`);

    await expect(reader.prepareAction(fixedBuyRequest, result.snapshot)).rejects.toMatchObject({
      code: "GUARDS_CHANGED",
    });
  });
});

describe("prepareV3MarketIntent", () => {
  it("maps the UI inventory one-to-one to real SDK operations", async () => {
    const plan = buyPlan(1n);
    const methodNames = [
      "prepareMarketplaceApproval",
      "prepareList",
      "prepareUpdateListing",
      "prepareCancelListing",
      "prepareInvalidateListing",
      "prepareBuy",
      "prepareOffer",
      "prepareCancelOffer",
      "prepareAcceptOffer",
      "prepareInvalidateOffer",
      "prepareStartAuction",
      "prepareBid",
      "prepareCancelAuction",
      "prepareFinalizeAuction",
      "prepareMarketplaceClaim",
      "prepareReferralClaim",
    ] as const;
    const methods = Object.fromEntries(methodNames.map((name) => [name, vi.fn(async () => plan)]));
    const client = methods as unknown as SepbaseV3Client;
    const intents: Array<[V3MarketActionIntent, (typeof methodNames)[number]]> = [
      [{ kind: "marketplace-approve", tokenId: 1n }, "prepareMarketplaceApproval"],
      [{ kind: "fixed-list", tokenId: 1n, price: 1n, deadline: 2n }, "prepareList"],
      [{ kind: "fixed-update", tokenId: 1n, newPrice: 2n, newDeadline: 3n }, "prepareUpdateListing"],
      [{ kind: "fixed-cancel", tokenId: 1n }, "prepareCancelListing"],
      [{ kind: "fixed-invalidate", tokenId: 1n }, "prepareInvalidateListing"],
      [{ kind: "fixed-buy", tokenId: 1n, recipient }, "prepareBuy"],
      [{ kind: "offer-create", tokenId: 1n, recipient, amount: 2n, deadline: 3n }, "prepareOffer"],
      [{ kind: "offer-cancel", offerId }, "prepareCancelOffer"],
      [{ kind: "offer-accept", offerId }, "prepareAcceptOffer"],
      [{ kind: "offer-invalidate", offerId }, "prepareInvalidateOffer"],
      [{ kind: "auction-create", tokenId: 1n, reservePrice: 2n, startAt: 3n, endAt: 4n }, "prepareStartAuction"],
      [{ kind: "auction-bid", tokenId: 1n, amount: 2n, recipient }, "prepareBid"],
      [{ kind: "auction-cancel", tokenId: 1n }, "prepareCancelAuction"],
      [{ kind: "auction-finalize", tokenId: 1n }, "prepareFinalizeAuction"],
      [{ kind: "claim", claimKind: "offer-refund", recipient }, "prepareMarketplaceClaim"],
      [{ kind: "claim", claimKind: "referral", recipient }, "prepareReferralClaim"],
    ];

    for (const [intent, expectedMethod] of intents) {
      await prepareV3MarketIntent(client, intent, account);
      expect(methods[expectedMethod]).toHaveBeenCalledTimes(1);
    }
  });
});
