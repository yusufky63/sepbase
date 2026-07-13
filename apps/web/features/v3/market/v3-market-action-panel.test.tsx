import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SepbaseV3Client, V3TransactionPlan } from "@sepbase/sdk";
import type { Address, Hash, Hex } from "viem";
import type { V3PlanExecutionAdapter } from "@/lib/v3-plan-executor";
import {
  V3_MARKET_ACTION_COPY,
  V3MarketUiError,
  type V3MarketActionSnapshot,
  type V3MarketExecutionContext,
  type V3MarketReadResult,
  type V3MarketReaderAdapter,
  type V3ReleaseContext,
} from "./types";
import { V3MarketActionPanel } from "./v3-market-action-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const account = "0x1111111111111111111111111111111111111111" as const;
const seller = "0x2222222222222222222222222222222222222222" as const;
const recipient = "0x3333333333333333333333333333333333333333" as const;
const marketplace = "0x4444444444444444444444444444444444444444" as const;
const token = "0x5555555555555555555555555555555555555555" as const;
const bidder = "0x6666666666666666666666666666666666666666" as const;
const transactionHash = `0x${"77".repeat(32)}` as Hash;
const approvalHash = `0x${"88".repeat(32)}` as Hash;
const offerId = `0x${"99".repeat(32)}` as const;
const suiteReleaseId = `sha256:${"a".repeat(64)}` as const;

const nameContext = {
  tokenId: 7n,
  label: "alice",
  fullName: "alice.base",
  lifecycle: "active" as const,
  expiresAt: 2_100_000_000n,
  blockNumber: 100n,
};

const release: V3ReleaseContext = {
  status: "candidate",
  suiteReleaseId,
  chainId: 84_532,
  requiredConfirmations: 3,
};

function fixedBuySnapshot(): V3MarketActionSnapshot<"fixed-buy"> {
  return {
    kind: "fixed-buy",
    suiteReleaseId,
    chainId: 84_532,
    blockNumber: 100n,
    expectedSender: account,
    objectStatus: "ACTIVE",
    stale: false,
    permission: { allowed: true, reason: null },
    settlement: { kind: "erc20", tokenAddress: token, symbol: "USDC", decimals: 6 },
    settlementFlow: "collect",
    settlementAmount: 1_250_000n,
    approval: {
      required: true,
      token,
      spender: marketplace,
      amount: 1_250_000n,
      currentAllowance: 0n,
    },
    nftApproval: null,
    nameContext,
    guards: {
      expectedSeller: seller,
      expectedPrice: 1_250_000n,
      expectedDeadline: 2_000_000_000n,
      expectedListingNonce: 3n,
      expectedFeeBps: 125,
      expectedRecipient: recipient,
    },
  };
}

function staleOfferSnapshot(): V3MarketActionSnapshot<"offer-accept"> {
  return {
    kind: "offer-accept",
    suiteReleaseId,
    chainId: 84_532,
    blockNumber: 101n,
    expectedSender: account,
    objectStatus: "ACTIVE",
    stale: true,
    permission: { allowed: false, reason: "Ownership nonce changed; invalidate before refund." },
    settlement: { kind: "erc20", tokenAddress: token, symbol: "USDC", decimals: 6 },
    settlementFlow: "none",
    settlementAmount: 0n,
    approval: null,
    nftApproval: null,
    nameContext: { ...nameContext, blockNumber: 101n },
    guards: {
      offerId,
      expectedBuyer: bidder,
      expectedRecipient: recipient,
      expectedAmount: 900_000n,
      expectedDeadline: 2_000_000_000n,
      expectedFeeBps: 125,
    },
  };
}

function claimSnapshot(): V3MarketActionSnapshot<"claim"> {
  return {
    kind: "claim",
    suiteReleaseId,
    chainId: 84_532,
    blockNumber: 102n,
    expectedSender: account,
    objectStatus: "CLAIMABLE",
    stale: false,
    permission: { allowed: true, reason: null },
    settlement: { kind: "erc20", tokenAddress: token, symbol: "USDC", decimals: 6 },
    settlementFlow: "payout",
    settlementAmount: 0n,
    approval: null,
    nftApproval: null,
    nameContext: null,
    guards: { claimant: account, claimKind: "seller-proceeds", expectedRecipient: recipient, expectedAmount: 0n },
  };
}

function auctionBidSnapshot(): V3MarketActionSnapshot<"auction-bid"> {
  return {
    kind: "auction-bid",
    suiteReleaseId,
    chainId: 84_532,
    blockNumber: 103n,
    expectedSender: account,
    objectStatus: "OPEN",
    stale: false,
    permission: { allowed: true, reason: null },
    settlement: { kind: "native", tokenAddress: null, symbol: "ETH", decimals: 18 },
    settlementFlow: "collect",
    settlementAmount: 1_500_000_000_000_000n,
    approval: null,
    nftApproval: null,
    nameContext: { ...nameContext, blockNumber: 103n },
    guards: {
      expectedHighestBidder: bidder,
      expectedHighestBidRecipient: recipient,
      expectedHighestBid: 1_200_000_000_000_000n,
      expectedEndAt: 2_000_000_300n,
      expectedAuctionNonce: 4n,
      expectedFeeBps: 125,
    },
  };
}

function plan(withApproval: boolean): V3TransactionPlan {
  return {
    suiteReleaseId,
    chainId: 84_532,
    expectedSender: account,
    to: marketplace,
    data: "0x1234" as Hex,
    value: 0n,
    functionName: "buyName",
    blockNumber: 104n,
    settlementApproval: withApproval ? {
      token,
      spender: marketplace,
      amount: 1_250_000n,
      data: "0xabcd" as Hex,
    } : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function executionFixture(options: { reconciliation?: ReturnType<typeof deferred<{ hash: Hash; blockNumber: bigint; status: "success" }>> } = {}) {
  let allowance = 0n;
  const reconciliation = options.reconciliation ?? deferred<{ hash: Hash; blockNumber: bigint; status: "success" }>();
  if (!options.reconciliation) {
    reconciliation.resolve({ hash: transactionHash, blockNumber: 120n, status: "success" });
  }
  const client = {
    manifest: { suiteReleaseId, requiredConfirmations: 3 },
    assertTransactionPlan: vi.fn(),
    reconcileTransaction: vi.fn(() => reconciliation.promise),
  } as unknown as SepbaseV3Client;
  const adapter: V3PlanExecutionAdapter = {
    account: account as Address,
    chainId: 84_532,
    readAllowance: vi.fn(async () => allowance),
    simulate: vi.fn(async () => undefined),
    send: vi.fn(async (transaction) => transaction.to.toLowerCase() === token.toLowerCase() ? approvalHash : transactionHash),
    waitForReceipt: vi.fn(async () => {
      allowance = 1_250_000n;
      return { status: "success" as const, blockNumber: 110n };
    }),
  };
  return { execution: { client, adapter } satisfies V3MarketExecutionContext, adapter, client, reconciliation };
}

function readerFor(snapshot: V3MarketActionSnapshot, prepared = plan(false)) {
  return {
    readAction: vi.fn(async () => ({ status: "ready" as const, snapshot })),
    prepareAction: vi.fn(async () => prepared),
  } satisfies V3MarketReaderAdapter;
}

describe("V3 market action foundation", () => {
  it("keeps draft actions explicitly not deployed without calling adapters", async () => {
    const user = userEvent.setup();
    const reader = readerFor(fixedBuySnapshot(), plan(true));
    const { execution, adapter } = executionFixture();
    render(
      <V3MarketActionPanel
        release={{ ...release, status: "draft" }}
        account={account}
        intent={{ kind: "fixed-buy", tokenId: 7n, recipient }}
        reader={reader}
        execution={execution}
      />,
    );

    expect(screen.getByText("V3_NOT_DEPLOYED")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    await user.tab();
    expect(reader.readAction).not.toHaveBeenCalled();
    expect(reader.prepareAction).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("fresh-reads fixed-buy guards, confirms exact approval and waits for reconciliation", async () => {
    const user = userEvent.setup();
    const snapshot = fixedBuySnapshot();
    const reader = readerFor(snapshot, plan(true));
    const reconciliation = deferred<{ hash: Hash; blockNumber: bigint; status: "success" }>();
    const { execution, adapter, client } = executionFixture({ reconciliation });
    render(
      <V3MarketActionPanel
        release={release}
        account={account}
        intent={{ kind: "fixed-buy", tokenId: 7n, recipient }}
        reader={reader}
        execution={execution}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load fresh snapshot" }));
    expect(await screen.findByText("EXPECTED PRICE")).toBeInTheDocument();
    expect(screen.getByText("alice.base")).toBeInTheDocument();
    expect(screen.getByText("EXPECTED FEE BPS")).toBeInTheDocument();
    expect(screen.getByText("EXPECTED LISTING NONCE")).toBeInTheDocument();
    expect(screen.getAllByText(recipient)).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Simulate and buy" }));
    await waitFor(() => expect(client.reconcileTransaction).toHaveBeenCalledOnce());
    expect(screen.queryByText("ECONOMIC ACTION CONFIRMED")).not.toBeInTheDocument();
    expect(reader.readAction).toHaveBeenCalledTimes(2);
    expect(reader.prepareAction).toHaveBeenCalledTimes(2);
    expect(reader.prepareAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ intent: expect.objectContaining({ kind: "fixed-buy" }) }),
      snapshot,
    );
    expect(adapter.send).toHaveBeenCalledTimes(2);
    expect(adapter.simulate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      to: token,
      value: 0n,
      data: "0xabcd",
    }));
    expect(adapter.simulate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      to: marketplace,
      value: 0n,
      data: "0x1234",
    }));

    await act(async () => {
      reconciliation.resolve({ hash: transactionHash, blockNumber: 120n, status: "success" });
      await reconciliation.promise;
    });
    expect(await screen.findByText("ECONOMIC ACTION CONFIRMED")).toBeInTheDocument();
    expect(screen.getByText(transactionHash)).toBeInTheDocument();
  });

  it("keeps stale permission failures, unavailable reads and a real zero distinct", async () => {
    const user = userEvent.setup();
    const staleReader = readerFor(staleOfferSnapshot());
    const fixture = executionFixture();
    const { rerender } = render(
      <V3MarketActionPanel
        release={release}
        account={account}
        intent={{ kind: "offer-accept", offerId }}
        reader={staleReader}
        execution={fixture.execution}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Load fresh snapshot" }));
    expect(await screen.findByText("ACTIVE / STALE")).toBeInTheDocument();
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate acceptance" })).toBeDisabled();

    const unavailableRead = deferred<V3MarketReadResult>();
    const unavailableReader = {
      readAction: vi.fn(() => unavailableRead.promise),
      prepareAction: vi.fn(async () => plan(false)),
    } satisfies V3MarketReaderAdapter;
    rerender(
      <V3MarketActionPanel
        release={release}
        account={account}
        intent={{ kind: "offer-cancel", offerId }}
        reader={unavailableReader}
        execution={fixture.execution}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Load fresh snapshot" }));
    expect(screen.getByRole("status")).toHaveTextContent("Reading fresh block-pinned guards.");
    await act(async () => {
      unavailableRead.resolve({
        status: "unavailable",
        code: "RPC_UNAVAILABLE",
        message: "Pinned block read failed.",
        blockNumber: null,
      });
      await unavailableRead.promise;
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("STATE UNAVAILABLE");
    expect(screen.queryByText(/ZERO \/ 0/)).not.toBeInTheDocument();

    const zeroReader = readerFor(claimSnapshot());
    rerender(
      <V3MarketActionPanel
        release={release}
        account={account}
        intent={{ kind: "claim", claimKind: "seller-proceeds", recipient }}
        reader={zeroReader}
        execution={fixture.execution}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Load fresh snapshot" }));
    expect(await screen.findByText(/ZERO \/ 0 USDC/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate claim" })).toBeDisabled();
  });

  it("shows highest-bid/end-time guards and retries from a fresh read after failure", async () => {
    const user = userEvent.setup();
    const snapshot = auctionBidSnapshot();
    const reader = readerFor(snapshot);
    reader.readAction
      .mockResolvedValueOnce({ status: "ready", snapshot })
      .mockRejectedValueOnce(new V3MarketUiError("RPC_UNAVAILABLE", "Fresh auction read failed."))
      .mockResolvedValueOnce({ status: "ready", snapshot });
    const fixture = executionFixture();
    render(
      <V3MarketActionPanel
        release={release}
        account={account}
        intent={{ kind: "auction-bid", tokenId: 7n, amount: 1_500_000_000_000_000n, recipient }}
        reader={reader}
        execution={fixture.execution}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load fresh snapshot" }));
    expect(await screen.findByText("EXPECTED HIGHEST BID")).toBeInTheDocument();
    expect(screen.getByText("EXPECTED END AT")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Simulate bid" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fresh auction read failed.");
    expect(reader.prepareAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Retry fresh read" }));
    expect(await screen.findByText("ALLOWED AT SNAPSHOT")).toBeInTheDocument();
    expect(reader.readAction).toHaveBeenCalledTimes(3);
  });

  it("defines every fixed, offer, auction and unified-claim operation", () => {
    expect(Object.keys(V3_MARKET_ACTION_COPY).sort()).toEqual([
      "auction-bid",
      "auction-cancel",
      "auction-create",
      "auction-finalize",
      "claim",
      "fixed-buy",
      "fixed-cancel",
      "fixed-invalidate",
      "fixed-list",
      "fixed-update",
      "marketplace-approve",
      "offer-accept",
      "offer-cancel",
      "offer-create",
      "offer-invalidate",
    ]);
  });

  it("keeps the module-scoped write lease across unmount and blocks a second send", async () => {
    const user = userEvent.setup();
    const snapshot = fixedBuySnapshot();
    const reader = readerFor(snapshot);
    const fixture = executionFixture();
    const pendingSend = deferred<Hash>();
    fixture.adapter.send = vi.fn(() => pendingSend.promise);

    const first = render(
      <V3MarketActionPanel
        release={release}
        account={account}
        intent={{ kind: "fixed-buy", tokenId: 7n, recipient }}
        reader={reader}
        execution={fixture.execution}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Load fresh snapshot" }));
    await screen.findByText("alice.base");
    await user.click(screen.getByRole("button", { name: "Simulate and buy" }));
    await waitFor(() => expect(fixture.adapter.send).toHaveBeenCalledTimes(1));
    first.unmount();

    render(
      <V3MarketActionPanel
        release={release}
        account={account}
        intent={{ kind: "fixed-buy", tokenId: 7n, recipient }}
        reader={reader}
        execution={fixture.execution}
      />,
    );
    expect(screen.getByRole("button", { name: "Load fresh snapshot" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Simulate and buy" })).toBeDisabled();
    expect(fixture.adapter.send).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingSend.resolve(transactionHash);
      await pendingSend.promise;
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Load fresh snapshot" })).toBeEnabled());
  });
});
