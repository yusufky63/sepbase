import type { Metadata } from "next";
import { AccountWorkspace } from "@/features/account/account-workspace";

export const metadata: Metadata = {
  title: "My account",
  description: "Manage names, referrals, marketplace listings, and claimable proceeds.",
  robots: { index: false, follow: false },
};

type MePageProps = { searchParams: Promise<{ tab?: string | string[] }> };

export default async function MePage({ searchParams }: MePageProps) {
  const requested = (await searchParams).tab;
  const initialTab = requested === "referrals" || requested === "listings" ? requested : "names";
  return <AccountWorkspace initialTab={initialTab} />;
}
