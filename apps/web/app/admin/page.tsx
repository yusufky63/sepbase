import type { Metadata } from "next";
import { AdminWorkspace, type AdminTab } from "@/features/admin/admin-workspace";

export const metadata: Metadata = {
  title: "Admin operations",
  description: "Authorized contract operations and activity.",
  robots: { index: false, follow: false },
};

type AdminPageProps = { searchParams: Promise<{ tab?: string | string[] }> };

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const requested = (await searchParams).tab;
  const initialTab: AdminTab = requested === "activity" || requested === "controls" ? requested : "overview";
  return <AdminWorkspace initialTab={initialTab} />;
}
