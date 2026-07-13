import { projectConfig } from "@/config/project.config";
import { v3Manifest } from "@/lib/v3-api";
import {
  handleV3NormalizationAttestation,
  v3NormalizationAttestationOptions,
} from "@/lib/v3-attestation";
import { readV3AttestationIssuerConfig } from "@/lib/v3-attestation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowedOrigin() {
  return new URL(projectConfig.siteUrl).origin;
}

export function OPTIONS(request: Request) {
  return v3NormalizationAttestationOptions(request, {
    manifest: v3Manifest,
    allowedOrigin: allowedOrigin(),
  });
}

export function POST(request: Request) {
  return handleV3NormalizationAttestation(request, {
    manifest: v3Manifest,
    allowedOrigin: allowedOrigin(),
    readIssuerConfig: readV3AttestationIssuerConfig,
  });
}
