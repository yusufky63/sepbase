import type { Metadata } from "next";
import { MarketWorkspace } from "@/features/market/market-workspace";

export const metadata: Metadata = {
  title: "Market",
  description: "Browse and purchase active fixed-price names from the onchain marketplace.",
};

export default function MarketPage() {
  return <MarketWorkspace />;
}
