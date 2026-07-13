import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configuredChain } from "@/lib/chain";
import { WalletButton } from "./wallet-button";

const wallet = vi.hoisted(() => ({
  connector: { uid: "metamask-uid", id: "io.metamask", type: "injected", name: "MetaMask" },
  account: {
    address: "0x52908400098527886E0F7030069857D2E4169EE7",
    chainId: 1,
    isConnected: true,
    connector: undefined as { uid: string; id: string; type: string; name: string } | undefined,
  },
  connectors: [] as Array<{ uid: string; id: string; type: string; name: string }>,
  connections: [] as Array<{ connector: { uid: string; id: string; type: string; name: string } }>,
  connect: vi.fn(),
  disconnectAsync: vi.fn(),
  switchChain: vi.fn().mockResolvedValue(true),
  switchError: null as Error | null,
}));

vi.mock("wagmi", () => ({
  useAccount: () => wallet.account,
  useConnect: () => ({ connectors: wallet.connectors, connect: wallet.connect, isPending: false }),
  useConnections: () => wallet.connections,
  useDisconnect: () => ({ disconnectAsync: wallet.disconnectAsync }),
}));

vi.mock("./use-configured-chain-switch", () => ({
  useConfiguredChainSwitch: () => ({
    error: wallet.switchError,
    isSwitching: false,
    switchToConfiguredChain: wallet.switchChain,
  }),
}));

describe("WalletButton wrong-network controls", () => {
  afterEach(cleanup);

  beforeEach(() => {
    wallet.account.chainId = 1;
    wallet.account.connector = wallet.connector;
    wallet.connectors = [];
    wallet.connections = [{ connector: wallet.connector }];
    wallet.switchError = null;
    wallet.disconnectAsync.mockReset();
    wallet.disconnectAsync.mockResolvedValue(undefined);
    wallet.switchChain.mockReset();
    wallet.switchChain.mockResolvedValue(true);
  });

  it("keeps both network switching and disconnect available", async () => {
    render(<WalletButton />);

    fireEvent.click(screen.getByRole("button", { name: `Switch to ${configuredChain.name}` }));
    fireEvent.click(screen.getByRole("button", { name: /Disconnect wallet/i }));

    expect(wallet.switchChain).toHaveBeenCalledOnce();
    await waitFor(() => expect(wallet.disconnectAsync).toHaveBeenCalledOnce());
    expect(wallet.disconnectAsync).toHaveBeenCalledWith({ connector: wallet.connector });
  });

  it("offers an explicit retry after a rejected switch", () => {
    wallet.switchError = new Error("Rejected");
    render(<WalletButton />);

    expect(screen.getByRole("button", { name: `Retry ${configuredChain.name}` })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/did not confirm the network switch/i);
    expect(screen.getByRole("button", { name: /Disconnect wallet/i })).toBeEnabled();
  });

  it("disconnects every wallet connection instead of falling through to the second wallet", async () => {
    const rabby = { uid: "rabby-uid", id: "io.rabby", type: "injected", name: "Rabby" };
    wallet.connections = [{ connector: wallet.connector }, { connector: rabby }];
    render(<WalletButton />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /MetaMask \+ Rabby are connected to this dApp/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /Disconnect all 2 wallets/i }));

    await waitFor(() => expect(wallet.disconnectAsync).toHaveBeenCalledTimes(2));
    expect(wallet.disconnectAsync).toHaveBeenNthCalledWith(1, { connector: wallet.connector });
    expect(wallet.disconnectAsync).toHaveBeenNthCalledWith(2, { connector: rabby });
  });
});
