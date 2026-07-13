import { NextResponse } from "next/server";
import { legacyV2X402 } from "./legacy-v2-adapter";
import { v3Manifest } from "@/lib/v3-api";
import {
  X402_EXACT_SCHEME,
  X402_PROTOCOL_VERSION,
  X402_REGISTRATION_PATH,
  X402_REGISTRATION_QUOTE_PATH,
} from "./constants";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cache-Control": "private, no-store",
};

export function x402Context() {
  return {
    protocolVersion: X402_PROTOCOL_VERSION,
    scheme: X402_EXACT_SCHEME,
    network: `eip155:${legacyV2X402.chainId}`,
    chainId: legacyV2X402.chainId,
    contract: legacyV2X402.protocolAddress,
    contractVersion: legacyV2X402.contractVersion,
    suffix: legacyV2X402.suffix,
    quotePath: X402_REGISTRATION_QUOTE_PATH,
    registrationPath: X402_REGISTRATION_PATH,
  };
}

export function v3X402Context() {
  return {
    protocolVersion: X402_PROTOCOL_VERSION,
    scheme: X402_EXACT_SCHEME,
    network: `eip155:${v3Manifest.chainId}`,
    chainId: v3Manifest.chainId,
    contract: v3Manifest.contracts.controller.address,
    contractVersion: v3Manifest.suiteVersion,
    suiteReleaseId: v3Manifest.suiteReleaseId,
    releaseStatus: v3Manifest.releaseStatus,
    suffix: v3Manifest.suffix,
    quotePath: X402_REGISTRATION_QUOTE_PATH,
    registrationPath: X402_REGISTRATION_PATH,
  };
}

export function x402Json(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
}

export function x402Error(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  context: ReturnType<typeof x402Context> | ReturnType<typeof v3X402Context> = x402Context(),
) {
  return x402Json({ error: { code, message, ...details }, context }, { status });
}

export function x402Options() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...headers, "Access-Control-Max-Age": "86400" },
  });
}
