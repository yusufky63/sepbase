import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import {
  acquireV3MarketExecutionLease,
  releaseV3MarketExecutionLease,
  type V3MarketExecutionLease,
} from "./v3-market-execution-lock";

const mocks = vi.hoisted(() => {
  const walletA = "0x1111111111111111111111111111111111111111" as Address;
  const walletB = "0x2222222222222222222222222222222222222222" as Address;
  const seller = "0x3333333333333333333333333333333333333333" as Address;
  const zero = "0x0000000000000000000000000000000000000000" as Address;
  const offerId = `0x${"ab".repeat(32)}` as const;
  const account = { address: walletA, chainId: 84_532 };
  const client = {
    manifest: { requiredConfirmations: 1 },
    publicClient: {
      getBlockNumber: vi.fn(async () => 900n),
      multicall: vi.fn(async ({ contracts }: { contracts: readonly { functionName: string }[] }) =>
        contracts.map(({ functionName }) => {
          if (functionName === "labelOf") return "alice";
          if (functionName === "fullName") return "alice.base";
          if (functionName === "statusOf") return 1;
          if (functionName === "expiresAt") return 2_100_000_000n;
          throw new Error(`Unexpected context read: ${functionName}`);
        })),
    },
    contracts: {
      registry: { address: seller, abi: [] },
    },
    getListings: vi.fn(async (_cursor: bigint, _limit: number, blockNumber: bigint) => ({
      items: [{ tokenId: 42n, seller, price: 1_250_000n, deadline: 2_000_000_000n, transferNonce: 1n, listingNonce: 2n, feeBps: 0 }],
      nextCursor: 1n,
      blockNumber,
    })),
    getGlobalOffers: vi.fn(async (_cursor: bigint, _limit: number, _terminal: boolean, blockNumber: bigint) => ({
      items: [{ offerId, tokenId: 42n, buyer: walletB, recipient: walletB, ownerSnapshot: walletA, amount: 900_000n, deadline: 2_000_000_000n, transferNonce: 1n, feeBps: 0, state: "active", stale: false }],
      nextCursor: 1n,
      blockNumber,
    })),
    getAuctions: vi.fn(async (_cursor: bigint, _limit: number, blockNumber: bigint) => ({
      items: [{ tokenId: 42n, seller, highestBidder: zero, highestBidRecipient: zero, reservePrice: 1_000_000n, highestBid: 0n, startAt: 1_900_000_000n, endAt: 2_000_000_000n, hardEndAt: 2_000_003_600n, transferNonce: 1n, auctionNonce: 1n, feeBps: 0, extensionsUsed: 0 }],
      nextCursor: 1n,
      blockNumber,
    })),
    getOwnedNames: vi.fn(async (_account: Address, _cursor: bigint, _limit: number, blockNumber: bigint) => ({
      items: [], total: 0n, nextCursor: 0n, blockNumber,
    })),
    getAccountBalances: vi.fn(async (nextAccount: Address, blockNumber: bigint) => ({
      account: nextAccount,
      referralRewards: 0n,
      marketplaceClaimable: 0n,
      primary: { address: nextAccount, name: null, verified: false, reason: "no-primary", blockNumber },
      blockNumber,
    })),
  };
  return { account, client, walletA, walletB };
});

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({}),
  useSendTransaction: () => ({ sendTransactionAsync: vi.fn() }),
}));

vi.mock("@/components/wallet/wallet-button", () => ({ WalletButton: () => <button type="button">Connect</button> }));
vi.mock("@/components/wallet/use-configured-chain-switch", () => ({
  useConfiguredChainSwitch: () => ({ isSwitching: false, switchToConfiguredChain: vi.fn() }),
}));
vi.mock("@/lib/v3-browser-runtime", () => ({
  getV3BrowserClient: vi.fn(async () => mocks.client),
  v3BrowserManifest: {
    releaseStatus: "candidate",
    suiteReleaseId: `sha256:${"a".repeat(64)}`,
    chainId: 84_532,
    chainName: "Base Sepolia",
    requiredConfirmations: 1,
    settlement: { kind: "erc20", tokenAddress: mocks.walletB, symbol: "USDC", decimals: 6 },
    marketplace: { maxPageSize: 50 },
  },
}));
vi.mock("@/lib/use-v3-plan-execution", () => ({ createV3WagmiAdapter: vi.fn(() => ({})) }));
vi.mock("./create-v3-market-reader", () => ({ createV3MarketReader: vi.fn(() => ({})) }));
vi.mock("./v3-market-action-panel", () => ({
  V3MarketActionPanel: ({ intent }: { intent: { kind: string; recipient?: Address } }) => (
    <div data-testid="review-intent">{intent.kind}:{intent.recipient ?? "none"}</div>
  ),
}));

import { V3MarketWorkspace } from "./v3-market-workspace";

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
  mocks.account.address = mocks.walletA;
  mocks.account.chainId = 84_532;
  vi.clearAllMocks();
});

describe("V3MarketWorkspace", () => {
  it("keeps market types in simple tabs, resets recipient on wallet change and disables controls under the global lease", async () => {
    const user = userEvent.setup();
    const view = render(<V3MarketWorkspace />);
    expect(await screen.findByText("alice.base")).toBeInTheDocument();
    expect(screen.queryByText("OPEN")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Offers/i }));
    expect(await screen.findByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("alice.base")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Auctions/i }));
    expect(screen.getByRole("button", { name: "Complete alice.base" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: /For sale/i }));

    await user.click(screen.getByRole("button", { name: "Buy alice.base" }));
    expect(screen.getByTestId("review-intent")).toHaveTextContent(`fixed-buy:${mocks.walletA}`);

    mocks.account.address = mocks.walletB;
    view.rerender(<V3MarketWorkspace />);
    await screen.findByRole("button", { name: "Buy alice.base" });
    await user.click(screen.getByRole("button", { name: "Buy alice.base" }));
    expect(screen.getByTestId("review-intent")).toHaveTextContent(`fixed-buy:${mocks.walletB}`);

    let lease: V3MarketExecutionLease | null = null;
    act(() => {
      lease = acquireV3MarketExecutionLease();
    });
    try {
      expect(screen.getByRole("button", { name: "Buy alice.base" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Refresh market" })).toBeDisabled();
      expect(screen.getByRole("combobox", { name: "ACTION" })).toBeDisabled();
    } finally {
      act(() => releaseV3MarketExecutionLease(lease!));
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "Buy alice.base" })).toBeEnabled());
  });
});
