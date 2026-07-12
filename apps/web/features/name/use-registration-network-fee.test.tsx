import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deploymentManifest } from "@/lib/deployment-manifest";
import { useRegistrationNetworkFee } from "./use-registration-network-fee";

const mocks = vi.hoisted(() => ({
  estimateTotalFee: vi.fn(),
  publicClient: {},
}));

vi.mock("wagmi", () => ({
  usePublicClient: () => mocks.publicClient,
}));

vi.mock("viem/op-stack", () => ({
  estimateTotalFee: mocks.estimateTotalFee,
}));

const account = "0x78de409a6306550882328E2a67160471368387FF" as const;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("useRegistrationNetworkFee", () => {
  beforeEach(() => {
    mocks.estimateTotalFee.mockReset();
    mocks.estimateTotalFee.mockResolvedValue(2_166_611_126_366n);
  });

  it("uses the configured OP Stack oracle path for a registration estimate", async () => {
    const { result } = renderHook(() => useRegistrationNetworkFee({
      account,
      amount: 500_000_000_000_000n,
      enabled: true,
      expectedReferralRewardBps: 1_000,
      label: "alice",
      recipient: account,
      referrer: null,
      years: 1,
    }), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(2_166_611_126_366n));
    expect(mocks.estimateTotalFee).toHaveBeenCalledOnce();
    expect(mocks.estimateTotalFee.mock.calls[0]?.[1]).toMatchObject({
      account,
      to: deploymentManifest.contract,
      value: 500_000_000_000_000n,
    });
  });

  it("does not query until registration prerequisites are ready", async () => {
    renderHook(() => useRegistrationNetworkFee({
      account,
      amount: 500_000_000_000_000n,
      enabled: false,
      expectedReferralRewardBps: 0,
      label: "alice",
      recipient: account,
      referrer: null,
      years: 1,
    }), { wrapper });

    await Promise.resolve();
    expect(mocks.estimateTotalFee).not.toHaveBeenCalled();
  });
});
