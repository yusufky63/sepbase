import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configuredChain } from "@/lib/chain";
import { WalletButton } from "./wallet-button";

type MockConnector = {
  uid: string;
  name: string;
  type?: string;
  rdns?: string;
};

type MockConnection = {
  connector: MockConnector;
  chainId: number;
  accounts: readonly string[];
};

const mocks = vi.hoisted(() => ({
  account: {
    address: undefined as string | undefined,
    chainId: undefined as number | undefined,
    connector: undefined as MockConnector | undefined,
    isConnected: false,
  },
  connectors: [] as MockConnector[],
  connections: [] as MockConnection[],
  connectAsync: vi.fn(),
  disconnectAsync: vi.fn(),
  switchConnectionAsync: vi.fn(),
  switchToConfiguredChain: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => mocks.account,
  useConnectors: () => mocks.connectors,
  useConnect: () => ({
    mutateAsync: mocks.connectAsync,
    isPending: false,
  }),
  useConnections: () => mocks.connections,
  useDisconnect: () => ({
    mutateAsync: mocks.disconnectAsync,
    isPending: false,
  }),
  useSwitchConnection: () => ({
    mutateAsync: mocks.switchConnectionAsync,
    isPending: false,
  }),
}));

vi.mock("./use-configured-chain-switch", () => ({
  useConfiguredChainSwitch: () => ({
    isSwitching: false,
    switchToConfiguredChain: mocks.switchToConfiguredChain,
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    title,
    description,
    children,
  }: {
    open: boolean;
    title: string;
    description: string;
    children: ReactNode;
  }) => open ? (
    <section role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  ) : null,
}));

const accountAddress = "0x1111111111111111111111111111111111111111";
const rabby: MockConnector = { uid: "rabby", name: "Rabby" };
const metaMask: MockConnector = { uid: "metamask", name: "MetaMask" };

function connected(connector: MockConnector, chainId = configuredChain.id): MockConnection {
  return { connector, chainId, accounts: [accountAddress] };
}

function setConnectedWallet(
  connector: MockConnector,
  chainId = configuredChain.id,
) {
  Object.assign(mocks.account, {
    address: accountAddress,
    chainId,
    connector,
    isConnected: true,
  });
}

describe("WalletButton", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    Object.assign(mocks.account, {
      address: undefined,
      chainId: undefined,
      connector: undefined,
      isConnected: false,
    });
    mocks.connectors.splice(0);
    mocks.connections.splice(0);
    mocks.connectAsync.mockReset();
    mocks.disconnectAsync.mockReset();
    mocks.switchConnectionAsync.mockReset();
    mocks.switchToConfiguredChain.mockReset();
    mocks.connectAsync.mockResolvedValue({ chainId: configuredChain.id });
    mocks.disconnectAsync.mockResolvedValue(undefined);
    mocks.switchConnectionAsync.mockResolvedValue({ chainId: configuredChain.id });
    mocks.switchToConfiguredChain.mockResolvedValue(true);
  });

  it("keeps network recovery and disconnect available together on the wrong chain", async () => {
    const user = userEvent.setup();
    setConnectedWallet(rabby, 1);
    mocks.connectors.push(rabby);
    mocks.connections.push(connected(rabby, 1));

    render(<WalletButton />);
    await user.click(
      screen.getByRole("button", { name: `Switch to ${configuredChain.name}` }),
    );

    const dialog = screen.getByRole("dialog", { name: "Wallet options" });
    expect(
      within(dialog).getByRole("button", { name: `Switch to ${configuredChain.name}` }),
    ).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Disconnect wallet" })).toBeEnabled();
  });

  it("disconnects every tracked wallet connection instead of leaving a hidden fallback", async () => {
    const user = userEvent.setup();
    setConnectedWallet(rabby);
    mocks.connectors.push(rabby, metaMask);
    mocks.connections.push(connected(rabby), connected(metaMask));

    render(<WalletButton />);
    await user.click(screen.getByTitle("Wallet options"));
    await user.click(
      within(screen.getByRole("dialog", { name: "Wallet options" }))
        .getByRole("button", { name: "Disconnect all wallets" }),
    );

    await waitFor(() => expect(mocks.disconnectAsync).toHaveBeenCalledTimes(2));
    expect(mocks.disconnectAsync).toHaveBeenNthCalledWith(1, { connector: rabby });
    expect(mocks.disconnectAsync).toHaveBeenNthCalledWith(2, { connector: metaMask });
  });

  it("switches to an already connected wallet without reconnecting it", async () => {
    const user = userEvent.setup();
    setConnectedWallet(rabby);
    mocks.connectors.push(rabby, metaMask);
    mocks.connections.push(connected(rabby), connected(metaMask));

    render(<WalletButton />);
    await user.click(screen.getByTitle("Wallet options"));
    await user.click(
      within(screen.getByRole("dialog", { name: "Wallet options" }))
        .getByRole("button", { name: /MetaMask.*SWITCH/ }),
    );

    await waitFor(() => {
      expect(mocks.switchConnectionAsync).toHaveBeenCalledWith({ connector: metaMask });
    });
    expect(mocks.connectAsync).not.toHaveBeenCalled();
  });

  it("connects a new wallet directly to the configured chain", async () => {
    const user = userEvent.setup();
    setConnectedWallet(rabby);
    mocks.connectors.push(rabby, metaMask);
    mocks.connections.push(connected(rabby));

    render(<WalletButton />);
    await user.click(screen.getByTitle("Wallet options"));
    await user.click(
      within(screen.getByRole("dialog", { name: "Wallet options" }))
        .getByRole("button", { name: /MetaMask.*CONNECT/ }),
    );

    await waitFor(() => {
      expect(mocks.connectAsync).toHaveBeenCalledWith({
        connector: metaMask,
        chainId: configuredChain.id,
      });
    });
    expect(mocks.switchConnectionAsync).not.toHaveBeenCalled();
  });

  it("hides the ambiguous injected fallback when dedicated wallets are discovered", async () => {
    const user = userEvent.setup();
    const genericInjected: MockConnector = {
      uid: "injected",
      name: "Injected",
      type: "injected",
    };
    const discoveredRabby: MockConnector = {
      ...rabby,
      type: "injected",
      rdns: "io.rabby",
    };
    mocks.connectors.push(genericInjected, discoveredRabby);

    render(<WalletButton />);
    await user.click(screen.getByRole("button", { name: "Connect" }));

    const dialog = screen.getByRole("dialog", { name: "Connect a wallet" });
    expect(within(dialog).queryByRole("button", { name: /Injected/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Rabby.*CONNECT/ })).toBeEnabled();
  });

  it("keeps the wallet dialog usable when a network switch is rejected", async () => {
    const user = userEvent.setup();
    setConnectedWallet(rabby, 1);
    mocks.connectors.push(rabby);
    mocks.connections.push(connected(rabby, 1));
    mocks.switchToConfiguredChain.mockResolvedValue(false);

    render(<WalletButton />);
    await user.click(
      screen.getByRole("button", { name: `Switch to ${configuredChain.name}` }),
    );
    const dialog = screen.getByRole("dialog", { name: "Wallet options" });
    await user.click(
      within(dialog).getByRole("button", { name: `Switch to ${configuredChain.name}` }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      `Could not switch this wallet to ${configuredChain.name}`,
    );
    expect(within(dialog).getByRole("button", { name: "Disconnect wallet" })).toBeEnabled();
  });
});
