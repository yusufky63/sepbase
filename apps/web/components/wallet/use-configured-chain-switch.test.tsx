import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configuredChain } from "@/lib/chain";
import { useConfiguredChainSwitch } from "./use-configured-chain-switch";

const mocks = vi.hoisted(() => ({
  switchChainAsync: vi.fn(),
  account: {
    chainId: 1,
    connector: {
      uid: "metamask-uid",
      name: "MetaMask",
      getChainId: vi.fn(),
    },
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  useSwitchChain: () => ({
    error: null,
    isPending: false,
    switchChainAsync: mocks.switchChainAsync,
  }),
}));

describe("useConfiguredChainSwitch", () => {
  beforeEach(() => {
    mocks.switchChainAsync.mockReset();
    mocks.switchChainAsync.mockResolvedValue(undefined);
    mocks.account.chainId = 1;
    mocks.account.connector.uid = "metamask-uid";
    mocks.account.connector.getChainId.mockReset();
    mocks.account.connector.getChainId.mockResolvedValue(configuredChain.id);
  });

  it("requests the configured chain automatically once while the guard is active", async () => {
    const { rerender } = renderHook(
      ({ automatic }) => useConfiguredChainSwitch(automatic),
      { initialProps: { automatic: true } },
    );

    await waitFor(() => expect(mocks.switchChainAsync).toHaveBeenCalledOnce());
    expect(mocks.switchChainAsync).toHaveBeenCalledWith({
      chainId: configuredChain.id,
      connector: mocks.account.connector,
    });

    rerender({ automatic: true });
    expect(mocks.switchChainAsync).toHaveBeenCalledOnce();
  });

  it("allows a manual retry after an automatic attempt", async () => {
    const { result } = renderHook(() => useConfiguredChainSwitch(true));
    await waitFor(() => expect(mocks.switchChainAsync).toHaveBeenCalledOnce());

    await act(async () => {
      expect(await result.current.switchToConfiguredChain()).toBe(true);
    });
    expect(mocks.switchChainAsync).toHaveBeenCalledTimes(2);
  });

  it("returns false when the wallet rejects or cannot perform the switch", async () => {
    mocks.switchChainAsync.mockRejectedValueOnce(new Error("Rejected"));
    const { result } = renderHook(() => useConfiguredChainSwitch());

    await act(async () => {
      expect(await result.current.switchToConfiguredChain()).toBe(false);
    });
    expect(result.current.error?.message).toBe("Rejected");
  });

  it("does not report success when the targeted wallet stays on another chain", async () => {
    mocks.account.connector.getChainId.mockResolvedValueOnce(1);
    const { result } = renderHook(() => useConfiguredChainSwitch());

    await act(async () => {
      expect(await result.current.switchToConfiguredChain()).toBe(false);
    });
    expect(result.current.error?.message).toBe("CHAIN_SWITCH_NOT_CONFIRMED");
  });

  it("keeps rapid switch requests single-flight and unlocks after completion", async () => {
    let completeSwitch: (() => void) | undefined;
    mocks.switchChainAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      completeSwitch = resolve;
    }));
    const { result } = renderHook(() => useConfiguredChainSwitch());

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.switchToConfiguredChain();
      second = result.current.switchToConfiguredChain();
    });

    expect(first).toBe(second);
    await waitFor(() => expect(mocks.switchChainAsync).toHaveBeenCalledOnce());
    expect(result.current.isSwitching).toBe(true);

    await act(async () => {
      completeSwitch?.();
      await first;
    });
    expect(result.current.isSwitching).toBe(false);

    await act(async () => {
      expect(await result.current.switchToConfiguredChain()).toBe(true);
    });
    expect(mocks.switchChainAsync).toHaveBeenCalledTimes(2);
  });

  it("shares one wallet request across separate header and page hook instances", async () => {
    let completeSwitch: (() => void) | undefined;
    mocks.switchChainAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      completeSwitch = resolve;
    }));
    const header = renderHook(() => useConfiguredChainSwitch());
    const page = renderHook(() => useConfiguredChainSwitch());

    let headerAttempt!: Promise<boolean>;
    let pageAttempt!: Promise<boolean>;
    act(() => {
      headerAttempt = header.result.current.switchToConfiguredChain();
      pageAttempt = page.result.current.switchToConfiguredChain();
    });

    await waitFor(() => expect(mocks.switchChainAsync).toHaveBeenCalledOnce());
    expect(header.result.current.isSwitching).toBe(true);
    expect(page.result.current.isSwitching).toBe(true);

    await act(async () => {
      completeSwitch?.();
      await Promise.all([headerAttempt, pageAttempt]);
    });
    expect(header.result.current.isSwitching).toBe(false);
    expect(page.result.current.isSwitching).toBe(false);
    header.unmount();
    page.unmount();
  });

  it("releases the shared lease after the initiating component unmounts", async () => {
    let completeSwitch: (() => void) | undefined;
    mocks.switchChainAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      completeSwitch = resolve;
    }));
    const first = renderHook(() => useConfiguredChainSwitch());
    let firstAttempt!: Promise<boolean>;

    act(() => {
      firstAttempt = first.result.current.switchToConfiguredChain();
    });
    await waitFor(() => expect(mocks.switchChainAsync).toHaveBeenCalledOnce());
    first.unmount();

    completeSwitch?.();
    await firstAttempt;

    const retry = renderHook(() => useConfiguredChainSwitch());
    await act(async () => {
      expect(await retry.result.current.switchToConfiguredChain()).toBe(true);
    });
    expect(mocks.switchChainAsync).toHaveBeenCalledTimes(2);
    retry.unmount();
  });

  it("clears a previous failure when a manual retry succeeds", async () => {
    mocks.switchChainAsync
      .mockRejectedValueOnce(new Error("Rejected"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useConfiguredChainSwitch());

    await act(async () => {
      expect(await result.current.switchToConfiguredChain()).toBe(false);
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      expect(await result.current.switchToConfiguredChain()).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });
});
