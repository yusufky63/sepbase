import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion/motion-reveal", () => ({
  MotionReveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/search/name-search", () => ({ NameSearch: () => <div>V3 search</div> }));
vi.mock("./v3-home-stats", () => ({ V3HomeStats: () => <div>V3 live stats</div> }));
vi.mock("./v3-home-recent", () => ({ V3HomeRecentNames: () => <div>V3 recent names</div> }));

import { V3Home } from "./v3-home";

describe("V3 home content", () => {
  it("uses the V3 manifest economics and protocol model without a fiat claim", () => {
    render(<V3Home />);

    expect(screen.getAllByText("0.0005 USDC").length).toBeGreaterThan(0);
    expect(screen.getByText("TESTNET ASSET / NO FIAT VALUE IMPLIED")).toBeInTheDocument();
    expect(screen.getByText("ENSIP-15 / UNICODE")).toBeInTheDocument();
    expect(screen.getByText("COMMIT → REVEAL")).toBeInTheDocument();
    expect(screen.getByText(/escrowed offers, English auctions/i)).toBeInTheDocument();
    expect(screen.queryByText(/List and buy names at fixed prices/i)).not.toBeInTheDocument();
  });
});
