import { getAddress, isAddress, zeroAddress } from "viem";
import { z } from "zod";
import { getServerV3Client } from "@/lib/v3-api";
import {
  optionalKeeperAddress,
  publicX402RegistrationReadiness,
  quoteTtlSeconds,
} from "@/lib/x402/config";
import { MAX_REGISTRATION_BODY_BYTES } from "@/lib/x402/constants";
import { isX402RegistrationError, X402RegistrationError } from "@/lib/x402/errors";
import { v3X402Context, x402Error, x402Json, x402Options } from "@/lib/x402/http";
import { issueLiveRegistrationQuote } from "@/lib/x402/onchain";
import { parseRegistrationQuoteRequest } from "@/lib/x402/quote";
import { legacyV2X402 } from "@/lib/x402/legacy-v2-adapter";
import { createV3PaidRegistrationRuntime } from "@/lib/x402/runtime-factory";
import { issueV3PaidRegistrationQuote } from "@/lib/x402/v3-quote-issuer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return x402Options();
}

const address = z.string().refine(isAddress).transform((value) => getAddress(value));
const paidQuoteInput = z.object({
  label: z.string().min(1).max(256),
  recipient: address.refine((value) => value !== zeroAddress),
  durationYears: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  referrer: address.nullable().optional(),
  initialization: z.object({
    addressRecord: address,
    textRecords: z.array(z.object({
      key: z.string().min(1).max(64),
      value: z.string().max(512),
    }).strict()).max(16).optional(),
  }).strict(),
}).strict();

async function boundedBody(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new X402RegistrationError(415, "JSON_REQUIRED", "The V3 paid quote request must use application/json.");
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_REGISTRATION_BODY_BYTES)) {
    throw new X402RegistrationError(413, "REQUEST_TOO_LARGE", "The V3 paid quote request is too large.");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REGISTRATION_BODY_BYTES) {
    throw new X402RegistrationError(413, "REQUEST_TOO_LARGE", "The V3 paid quote request is too large.");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new X402RegistrationError(400, "INVALID_JSON", "The V3 paid quote request is not valid UTF-8 JSON.");
  }
}

export async function POST(request: Request) {
  let configured: ReturnType<typeof createV3PaidRegistrationRuntime>;
  try {
    // Read no attacker body or payment material before every live/runtime gate passes.
    configured = createV3PaidRegistrationRuntime();
  } catch {
    return x402Error(503, "X402_PAID_EXECUTION_AWAITING_V3", "The live V3 paid quote runtime is unavailable.", undefined, v3X402Context());
  }
  try {
    const parsed = paidQuoteInput.safeParse(await boundedBody(request));
    if (!parsed.success) {
      return x402Error(400, "INVALID_PAID_QUOTE_INPUT", "The V3 paid quote request is invalid.", undefined, v3X402Context());
    }
    const client = await getServerV3Client();
    const data = await issueV3PaidRegistrationQuote({
      label: parsed.data.label,
      recipient: parsed.data.recipient,
      durationYears: parsed.data.durationYears,
      referrer: parsed.data.referrer ?? null,
      initialization: {
        addressRecord: parsed.data.initialization.addressRecord,
        ...(parsed.data.initialization.textRecords
          ? { textRecords: parsed.data.initialization.textRecords }
          : {}),
      },
    }, {
      configured,
      client,
      nowSeconds: Math.floor(Date.now() / 1_000),
      ttlSeconds: quoteTtlSeconds(),
    });
    return x402Json({ data, registrationService: {
      available: true,
      implementationStatus: "operational",
      paidExecutionImplemented: true,
      protocolVersion: 2,
      network: `eip155:${client.manifest.chainId}`,
    } });
  } catch (error) {
    if (isX402RegistrationError(error)) {
      return x402Error(error.status, error.code, error.message, error.details, v3X402Context());
    }
    return x402Error(503, "X402_PAID_EXECUTION_AWAITING_V3", "The live V3 paid quote runtime is unavailable.", undefined, v3X402Context());
  }
}

export async function GET(request: Request) {
  try {
    if (!legacyV2X402.protocolAddress) {
      return x402Error(503, "NOT_DEPLOYED", "The protocol deployment is not available.");
    }
    const input = parseRegistrationQuoteRequest(request.url, {
      suffix: legacyV2X402.suffix,
      allowedYears: legacyV2X402.allowedYears,
      contract: getAddress(legacyV2X402.protocolAddress),
      keeperAddress: optionalKeeperAddress(),
    });
    const quote = await issueLiveRegistrationQuote(input);
    return x402Json({
      data: quote,
      registrationService: publicX402RegistrationReadiness(legacyV2X402.profile),
    });
  } catch (error) {
    if (isX402RegistrationError(error)) {
      return x402Error(error.status, error.code, error.message, error.details);
    }
    return x402Error(503, "RPC_UNAVAILABLE", "The configured chain RPC could not produce a live quote.");
  }
}
