import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkFeeAmount } from "./network-fee-amount";
import { SettlementAmount } from "./settlement-amount";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("live market reference amounts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a concise USD reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        asset: "ETH",
        currency: "USD",
        price: "2500.50",
        provider: "Coinbase",
        asOf: "2026-07-12T00:00:00.000Z",
      },
    }), { status: 200 })));

    render(<SettlementAmount amountBaseUnits={500_000_000_000_000n} />, { wrapper });
    expect(await screen.findByText(/USD 1\.25/)).toBeInTheDocument();
    expect(screen.queryByText(/TEST ASSET/)).not.toBeInTheDocument();
    expect(screen.queryByText(/COINBASE/)).not.toBeInTheDocument();
  });

  it("renders the estimated gas amount in the configured native currency", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        asset: "ETH",
        currency: "USD",
        price: "1800.68",
        provider: "Coinbase",
        asOf: "2026-07-12T00:00:00.000Z",
      },
    }), { status: 200 })));

    render(<NetworkFeeAmount amountBaseUnits={2_166_611_126_366n} />, { wrapper });
    expect(screen.getByText("0.000002 ETH")).toBeInTheDocument();
    expect(await screen.findByText(/< USD 0\.01/)).toBeInTheDocument();
  });
});
