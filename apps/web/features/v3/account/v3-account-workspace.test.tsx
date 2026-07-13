import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  getClient: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock("wagmi", () => ({ useAccount: mocks.useAccount }));
vi.mock("@/components/wallet/wallet-button", () => ({
  WalletButton: () => <button type="button">Mock wallet</button>,
}));
vi.mock("@/components/wallet/use-configured-chain-switch", () => ({
  useConfiguredChainSwitch: () => ({
    isSwitching: false,
    switchToConfiguredChain: mocks.switchChain,
  }),
}));
vi.mock("@/lib/use-v3-plan-execution", () => ({
  useV3PlanExecution: () => ({
    execute: vi.fn(),
    reset: vi.fn(),
    stage: "idle",
    result: null,
    error: null,
    isPending: false,
  }),
}));
vi.mock("@/lib/v3-browser-runtime", () => ({
  isV3ManifestOperational: () => true,
  getV3BrowserClient: mocks.getClient,
  v3BrowserManifest: {
    suiteReleaseId: `sha256:${"ab".repeat(32)}`,
    chainId: 84_532,
    chainName: "Base Sepolia",
    requiredConfirmations: 5,
    explorerUrl: "https://base-sepolia.blockscout.com",
    settlement: { kind: "erc20", tokenAddress: "0x3333333333333333333333333333333333333333", symbol: "USDC", decimals: 6 },
    nameRules: { allowedYears: [1, 2, 3, 4, 5] },
    contracts: {
      registry: { address: "0x4444444444444444444444444444444444444444" },
      controller: { address: "0x5555555555555555555555555555555555555555" },
      resolver: { address: "0x6666666666666666666666666666666666666666" },
      universalResolver: { address: "0x7777777777777777777777777777777777777777" },
      marketplace: { address: "0x8888888888888888888888888888888888888888" },
      marketLens: { address: "0x9999999999999999999999999999999999999999" },
      migration: { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    },
  },
}));

import { V3AccountWorkspace } from "./v3-account-workspace";

const account = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;

function renderWorkspace(children: ReactNode = <V3AccountWorkspace />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

function accountClient(input?: { withName?: boolean; fail?: boolean; primaryName?: string | null }) {
  if (input?.fail) return Promise.reject(new Error("RPC down"));
  const blockNumber = 96n;
  const items = input?.withName ? [{
    label: "alice",
    fullName: "alice.sepbase",
    node: `0x${"11".repeat(32)}`,
    tokenId: 7n,
    status: "active" as const,
    owner: account,
    resolvedAddress: other,
    expiresAt: 2_000_000_000n,
    available: false,
    reserved: false,
    transferNonce: 3n,
    blockNumber,
  }] : [];
  return Promise.resolve({
    manifest: { requiredConfirmations: 5 },
    publicClient: { getBlockNumber: vi.fn(async () => 100n) },
    getOwnedNames: vi.fn(async () => ({
      items,
      total: BigInt(items.length),
      nextCursor: BigInt(items.length),
      blockNumber,
    })),
    getAccountBalances: vi.fn(async () => ({
      account,
      referralRewards: 0n,
      marketplaceClaimable: 0n,
      primary: input?.primaryName
        ? { address: account, name: input.primaryName, verified: true, reason: null, blockNumber }
        : { address: account, name: null, verified: false, reason: "no-primary", blockNumber },
      blockNumber,
    })),
    quoteRegistration: vi.fn(async () => 500n),
    getMigrationEligibility: vi.fn(async ({ account: reviewedAccount, legacyLabel }: {
      account: Address;
      legacyLabel: string;
    }, reviewedBlock: bigint) => ({
      account: reviewedAccount,
      label: legacyLabel,
      tokenId: 7n,
      blockNumber: reviewedBlock,
      blockTimestamp: 1_900_000_000n,
      sourceChainId: 84_532n,
      legacyRegistry: "0xe000de3efe798Aa4F834fd952Bef35BAE1B16945" as Address,
      migrationStartsAt: 1_800_000_000n,
      migrationEndsAt: 2_000_000_000n,
      phase: "open" as const,
      legacyStatus: "active" as const,
      legacyOwner: reviewedAccount,
      legacyExpiresAt: 2_000_000_000n,
      legacyResolution: other,
      reserved: true,
      eligible: true,
      reason: null,
    })),
  });
}

beforeEach(() => {
  mocks.useAccount.mockReturnValue({ address: undefined, chainId: undefined });
  mocks.getClient.mockReset();
  mocks.switchChain.mockReset();
});

afterEach(cleanup);

describe("V3 account workspace boundaries", () => {
  it("requires a connected wallet before account reads", () => {
    renderWorkspace();
    expect(screen.getByRole("heading", { name: /Connect the wallet/i })).toBeInTheDocument();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("blocks preparation on the wrong chain", () => {
    mocks.useAccount.mockReturnValue({ address: account, chainId: 1 });
    renderWorkspace();
    expect(screen.getByRole("heading", { name: /Switch to Base Sepolia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to Base Sepolia/i })).toBeEnabled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable RPC snapshot from zero balances", async () => {
    mocks.useAccount.mockReturnValue({ address: account, chainId: 84_532 });
    mocks.getClient.mockImplementation(() => accountClient({ fail: true }));
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent(/not being treated as zero/i);
  });

  it("renders a confirmed empty account and explicit zero balances", async () => {
    mocks.useAccount.mockReturnValue({ address: account, chainId: 84_532 });
    mocks.getClient.mockImplementation(() => accountClient());
    renderWorkspace();
    expect(await screen.findByText(/owns zero V3 names at block 96/i)).toBeInTheDocument();
    expect(screen.getAllByText("0 USDC").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("BLOCK 96")).toBeInTheDocument();
  });

  it("disables primary until forward resolution confirms the connected owner", async () => {
    mocks.useAccount.mockReturnValue({ address: account, chainId: 84_532 });
    mocks.getClient.mockImplementation(() => accountClient({ withName: true }));
    renderWorkspace();
    expect(await screen.findByText(/Set the forward address to this wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set primary" })).toBeDisabled();
  });

  it("offers an explicit primary clear action when a primary exists", async () => {
    mocks.useAccount.mockReturnValue({ address: account, chainId: 84_532 });
    mocks.getClient.mockImplementation(() => accountClient({ withName: true, primaryName: "alice.sepbase" }));
    renderWorkspace();
    expect(await screen.findByRole("button", { name: "Clear primary" })).toBeEnabled();
  });

  it("reviews exact v2 migration state before enabling a guarded claim", async () => {
    mocks.useAccount.mockReturnValue({ address: account, chainId: 84_532 });
    mocks.getClient.mockImplementation(() => accountClient());
    renderWorkspace();

    const label = await screen.findByLabelText("Exact v2 label");
    fireEvent.change(label, { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Review eligibility" }));

    expect(await screen.findByText("ELIGIBLE TO CLAIM")).toBeInTheDocument();
    expect(screen.getByText(other)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim v2 name" })).toBeEnabled();
  });
});
