import type { Metadata } from "next";
import { AccountWorkspace } from "@/features/account/account-workspace";
import { V3AccountWorkspace } from "@/features/v3/account/v3-account-workspace";
import { v3PublicUiActive } from "@/lib/v3-api";

export const metadata: Metadata = {
  title: "My account",
  description: "Manage names, referrals, marketplace listings, and claimable proceeds.",
  alternates: { canonical: "/me" },
  robots: { index: false, follow: false },
};

type MePageProps = { searchParams: Promise<{ tab?: string | string[] }> };

export default async function MePage({ searchParams }: MePageProps) {
  const requested = (await searchParams).tab;
  const initialTab = requested === "referrals" || requested === "listings" ? requested : "names";
  if (v3PublicUiActive) {
    return <V3AccountWorkspace initialTab={initialTab} />;
  }
  return <AccountWorkspace initialTab={initialTab} />;
}
