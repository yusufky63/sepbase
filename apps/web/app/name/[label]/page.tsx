import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { normalizeName } from "@sepbase/sdk";
import { NameWorkspace } from "@/features/name/name-workspace";
import { V3RegistrationWorkspace } from "@/features/v3/registration/v3-registration-workspace";
import { projectConfig } from "@/config/project.config";
import { normalizeLabel } from "@/lib/name-normalization";
import { v3Manifest, v3PublicUiActive } from "@/lib/v3-api";

type PageProps = { params: Promise<{ label: string }> };

function normalizeRouteLabel(input: string) {
  if (!v3PublicUiActive) return normalizeLabel(input, projectConfig.brand.suffix);
  try {
    const normalized = normalizeName(input, v3Manifest.suffix, {
      minCodePoints: v3Manifest.nameRules.minCodepoints,
      maxCodePoints: v3Manifest.nameRules.maxCodepoints,
      maxUtf8Bytes: v3Manifest.nameRules.maxUtf8Bytes,
    });
    return {
      label: normalized.normalizedLabel,
      fullName: normalized.normalizedFullName,
      valid: true,
      reason: null,
    };
  } catch (error) {
    return {
      label: input,
      fullName: input,
      valid: false,
      reason: error instanceof Error ? error.message : "Invalid name.",
    };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { label } = await params;
  const normalized = normalizeRouteLabel(label);
  if (!normalized.valid) return { title: "Invalid name", robots: { index: false, follow: false } };
  return {
    title: normalized.fullName,
    description: `View ${normalized.fullName} on ${projectConfig.chain.name}.`,
    alternates: { canonical: `/name/${normalized.label}` },
    openGraph: {
      title: normalized.fullName,
      description: `A ${projectConfig.brand.name} identity on ${projectConfig.chain.name}.`,
      type: "website",
      url: `/name/${normalized.label}`,
    },
  };
}

export default async function NamePage({ params }: PageProps) {
  const { label: routeLabel } = await params;
  const input = routeLabel;
  const normalized = normalizeRouteLabel(input);

  if (!normalized.valid) notFound();
  if (input !== normalized.label) permanentRedirect(`/name/${encodeURIComponent(normalized.label)}`);
  return v3PublicUiActive
    ? <V3RegistrationWorkspace label={normalized.label} />
    : <NameWorkspace label={normalized.label} />;
}
