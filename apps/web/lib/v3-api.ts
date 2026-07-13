import { createHash } from "node:crypto";
import {
  createSepbaseV3Client,
  ManifestMismatchError,
  parseV3SuiteManifest,
  type SepbaseV3Client,
} from "@sepbase/sdk";
import { NextResponse } from "next/server";
import manifestJson from "../public/deployment-manifest.v3.json";
import { projectConfig } from "@/config/project.config";
import { X402_PAID_EXECUTION_IMPLEMENTED } from "@/lib/x402/constants";
import { publicX402RegistrationReadiness } from "@/lib/x402/config";
import { v3X402DeploymentProfile } from "@/lib/x402/deployment-profile";

export const v3Manifest = parseV3SuiteManifest(manifestJson);
const { suiteReleaseId: _suiteReleaseId, ...v3ManifestPayload } = v3Manifest;
const calculatedSuiteReleaseId = `sha256:${createHash("sha256")
  .update(JSON.stringify(v3ManifestPayload))
  .digest("hex")}`;
if (calculatedSuiteReleaseId !== _suiteReleaseId) {
  throw new ManifestMismatchError("Bundled V3 manifest release ID failed its runtime integrity check.");
}
export const v3Deployed = (v3Manifest.releaseStatus === "candidate" || v3Manifest.releaseStatus === "live")
  && Object.values(v3Manifest.contracts).every((module) => module.address && module.runtimeCodeHash)
  && v3Manifest.wiring.suiteConfigured;
export const v3PaidX402Operational = X402_PAID_EXECUTION_IMPLEMENTED
  && v3Manifest.releaseStatus === "live"
  && v3Manifest.capabilities.paidX402
  && v3Manifest.x402.paidExecutionAvailable
  && publicX402RegistrationReadiness(v3X402DeploymentProfile(v3Manifest)).available;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export function v3ApiContext() {
  return {
    schemaVersion: v3Manifest.schemaVersion,
    suiteVersion: v3Manifest.suiteVersion,
    releaseStatus: v3Manifest.releaseStatus,
    suiteReleaseId: v3Manifest.suiteReleaseId,
    chainId: v3Manifest.chainId,
    chainName: v3Manifest.chainName,
    suffix: v3Manifest.suffix,
    requiredConfirmations: v3Manifest.requiredConfirmations,
    settlement: v3Manifest.settlement,
    normalization: {
      profileId: v3Manifest.normalization.profileId,
      profileHash: v3Manifest.normalization.profileHash,
    },
  };
}

export function v3ApiJson(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(jsonSafe(data), {
    ...init,
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, s-maxage=12, stale-while-revalidate=48",
      ...init.headers,
    },
  });
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}

export function v3PublicCapabilities() {
  return { ...v3Manifest.capabilities, paidX402: v3PaidX402Operational };
}

export function v3PublicX402Status() {
  return { ...v3Manifest.x402, paidExecutionAvailable: v3PaidX402Operational };
}

export function v3ApiError(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return v3ApiJson(
    { error: { code, message, ...details }, context: v3ApiContext() },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function v3DeploymentPending() {
  return v3ApiError(
    503,
    "V3_NOT_DEPLOYED",
    "The V3 suite manifest is an address-free draft and cannot serve chain reads yet.",
    { manifestUrl: "/deployment-manifest.v3.json" },
  );
}

let pendingClient: Promise<SepbaseV3Client> | undefined;

export function getServerV3Client() {
  if (!v3Deployed) return Promise.reject(new Error("V3_NOT_DEPLOYED"));
  if (!pendingClient) {
    const siteOrigin = projectConfig.siteUrl.replace(/\/$/, "");
    const rpcUrl = process.env.RPC_URL?.trim() || v3Manifest.rpcUrl;
    pendingClient = createSepbaseV3Client({
      manifestUrl: `${siteOrigin}/deployment-manifest.v3.json`,
      rpcUrl,
      allowedManifestOrigins: [new URL(siteOrigin).origin],
      allowedRpcOrigins: [new URL(rpcUrl).origin],
    }).then((client) => {
      if (client.manifest.suiteReleaseId !== v3Manifest.suiteReleaseId) {
        throw new ManifestMismatchError("Runtime V3 manifest does not match the bundled API release.");
      }
      return client;
    }).catch((error: unknown) => {
      pendingClient = undefined;
      throw error;
    });
  }
  return pendingClient;
}

export function V3_OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
  });
}
