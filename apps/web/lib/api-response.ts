import { NextResponse } from "next/server";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export function apiContext() {
  return {
    contractVersion: deploymentManifest.contractVersion,
    chainId: deploymentManifest.chainId,
    chainName: deploymentManifest.chainName,
    contract: protocolAddress,
    suffix: deploymentManifest.suffix,
    nameRules: deploymentManifest.nameRules,
    settlement: deploymentManifest.settlement,
    pricing: {
      standardAnnualPriceBaseUnits: deploymentManifest.annualPriceBaseUnits,
      shortNamePriceMultipliers: deploymentManifest.shortNamePriceMultipliers,
      referenceFiat: deploymentManifest.referenceFiat,
    },
  };
}

export function apiJson(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, s-maxage=12, stale-while-revalidate=48",
      ...init.headers,
    },
  });
}

export function apiError(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return apiJson(
    { error: { code, message, ...details }, context: apiContext() },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function deploymentPending() {
  return apiError(
    503,
    "NOT_DEPLOYED",
    `The ${projectConfig.chain.name} contract address has not been published in the deployment manifest.`,
  );
}

export function rpcFailure() {
  return apiError(503, "RPC_UNAVAILABLE", "The configured chain RPC could not complete this read.");
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400",
    },
  });
}
