import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configuredChain } from "@/lib/chain";
import { useConfiguredChainSwitch } from "./use-configured-chain-switch";

const mocks = vi.hoisted(() => ({
  switchChainAsync: vi.fn(),
}));

vi.mock("wagmi", () => ({
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
  });

  it("requests the configured chain automatically once while the guard is active", async () => {
    const { rerender } = renderHook(
      ({ automatic }) => useConfiguredChainSwitch(automatic),
      { initialProps: { automatic: true } },
    );

    await waitFor(() => expect(mocks.switchChainAsync).toHaveBeenCalledOnce());
    expect(mocks.switchChainAsync).toHaveBeenCalledWith({ chainId: configuredChain.id });

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
  });
});
