import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const operational = vi.hoisted(() => vi.fn());

vi.mock("@/lib/v3-browser-runtime", () => ({
  isV3ManifestOperational: operational,
}));

vi.mock("./v3-market-workspace", () => ({
  V3MarketWorkspace: () => <div>VERIFIED V3 MARKET</div>,
}));

import { V3MarketRoute } from "./v3-market-route";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("V3MarketRoute", () => {
  it("preserves the previous market when V3 is not operational", () => {
    operational.mockReturnValue(false);
    render(<V3MarketRoute fallback={<div>V2 MARKET</div>} />);
    expect(screen.getByText("V2 MARKET")).toBeInTheDocument();
    expect(screen.queryByText("VERIFIED V3 MARKET")).not.toBeInTheDocument();
  });

  it("uses the V3 market for an operational candidate or live manifest", () => {
    operational.mockReturnValue(true);
    render(<V3MarketRoute fallback={<div>V2 MARKET</div>} />);
    expect(screen.getByText("VERIFIED V3 MARKET")).toBeInTheDocument();
    expect(screen.queryByText("V2 MARKET")).not.toBeInTheDocument();
  });
});
