import type { Metadata } from "next";
import { MarketWorkspace } from "@/features/market/market-workspace";
import { V3MarketRoute } from "@/features/v3/market/v3-market-route";
import { v3Deployed } from "@/lib/v3-api";

export const metadata: Metadata = {
  title: "Market",
  description: v3Deployed
    ? "List, buy, offer, bid, settle auctions, and claim proceeds on the V3 onchain marketplace."
    : "Browse and purchase active fixed-price names from the onchain marketplace.",
  alternates: { canonical: "/market" },
  openGraph: { url: "/market" },
};

export default function MarketPage() {
  return <V3MarketRoute fallback={<MarketWorkspace />} />;
}
