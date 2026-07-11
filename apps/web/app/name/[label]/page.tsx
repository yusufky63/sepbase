import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { NameWorkspace } from "@/features/name/name-workspace";
import { projectConfig } from "@/config/project.config";
import { normalizeLabel } from "@/lib/name-normalization";

type PageProps = { params: Promise<{ label: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { label } = await params;
  const normalized = normalizeLabel(label, projectConfig.brand.suffix);
  if (!normalized.valid) return { title: "Invalid name", robots: { index: false, follow: false } };
  return {
    title: normalized.fullName,
    description: `View ${normalized.fullName} on ${projectConfig.chain.name}.`,
    alternates: { canonical: `/name/${normalized.label}` },
    openGraph: {
      title: normalized.fullName,
      description: `A ${projectConfig.brand.name} identity on ${projectConfig.chain.name}.`,
      type: "website",
    },
  };
}

export default async function NamePage({ params }: PageProps) {
  const { label: routeLabel } = await params;
  const input = routeLabel;
  const normalized = normalizeLabel(input, projectConfig.brand.suffix);

  if (!normalized.valid) notFound();
  if (input !== normalized.label) permanentRedirect(`/name/${normalized.label}`);
  return <NameWorkspace label={normalized.label} />;
}
