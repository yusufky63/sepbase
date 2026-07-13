import {
  NameNormalizationError,
  SEPBASE_NORMALIZATION,
  hashV3NormalizationAttestation,
  normalizeName,
} from "@sepbase/sdk";
import {
  getAddress,
  hashTypedData,
  isAddress,
  recoverAddress,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";

export const V3_ATTESTATION_REQUEST_SCHEMA_VERSION = 1 as const;
export const V3_ATTESTATION_MAX_REQUEST_BYTES = 8 * 1024;
export const V3_ATTESTATION_MAX_ISSUER_RESPONSE_BYTES = 16 * 1024;
const UINT64_MAX = (1n << 64n) - 1n;
const HALF_CURVE_ORDER = BigInt("0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0");
const textEncoder = new TextEncoder();

const suiteReleaseId = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value): Hex => value.toLowerCase() as Hex);
const address = z.string().refine(isAddress, "Invalid EVM address.").transform((value): Address => getAddress(value));
const nonZeroAddress = address.refine((value) => value !== "0x0000000000000000000000000000000000000000");
const decimalUint64 = z.string().regex(/^(0|[1-9][0-9]*)$/)
  .refine((value) => BigInt(value) <= UINT64_MAX, "Must fit uint64.");
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((value): Hex => value.toLowerCase() as Hex);
const boundedUtf8 = (maximum: number) => z.string().refine(
  (value) => textEncoder.encode(value).byteLength <= maximum,
  `Must not exceed ${maximum} UTF-8 bytes.`,
);

const publicRequestSchema = z.object({
  schemaVersion: z.literal(V3_ATTESTATION_REQUEST_SCHEMA_VERSION),
  suiteReleaseId,
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  controller: nonZeroAddress,
  normalizationProfileId: z.string().min(1).max(200),
  normalizationProfileHash: bytes32,
  attestor: nonZeroAddress,
  recipient: nonZeroAddress,
  rawInput: boundedUtf8(512).refine((value) => value.length > 0),
  canonicalLabel: boundedUtf8(96).optional(),
}).strict();

const issuerResponseSchema = z.object({
  schemaVersion: z.literal(V3_ATTESTATION_REQUEST_SCHEMA_VERSION),
  suiteReleaseId,
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  controller: nonZeroAddress,
  normalizationProfileId: z.string().min(1).max(200),
  normalizationProfileHash: bytes32,
  label: boundedUtf8(96).refine((value) => value.length > 0 && !value.includes(".")),
  labelHash: bytes32,
  recipient: nonZeroAddress,
  attestor: nonZeroAddress,
  validUntil: decimalUint64,
  signature,
}).strict();

export type V3AttestationManifest = {
  schemaVersion: number;
  suiteVersion: string;
  releaseStatus: "draft" | "candidate" | "live";
  suiteReleaseId: string;
  chainId: number;
  suffix: string;
  nameRules: { minCodepoints: number; maxCodepoints: number; maxUtf8Bytes: number };
  normalization: {
    profileId: string;
    profileHash: Hex;
    attestor: Address | null;
    maxAttestationValiditySeconds: string;
  };
  contracts: { controller: { address: Address | null } };
  wiring: { suiteConfigured: boolean };
  commitment: { minAgeSeconds: string };
};

export type V3AttestationIssuerConfig = {
  endpoint: string;
  authorization: string;
};

export type V3AttestationHandlerOptions = {
  manifest: V3AttestationManifest;
  allowedOrigin: string;
  readIssuerConfig: () => V3AttestationIssuerConfig;
  fetcher?: typeof fetch;
  now?: () => bigint;
};

type RuntimeBinding = {
  suiteReleaseId: `sha256:${string}`;
  chainId: number;
  suffix: string;
  controller: Address;
  attestor: Address;
  profileId: string;
  profileHash: Hex;
  minAgeSeconds: bigint;
  maxValiditySeconds: bigint;
  nameRules: V3AttestationManifest["nameRules"];
};

class PublicRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function responseHeaders(origin?: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    Vary: "Origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
  };
}

function json(status: number, payload: unknown, origin?: string) {
  return Response.json(payload, { status, headers: responseHeaders(origin) });
}

function errorResponse(error: PublicRequestError, origin?: string) {
  return json(error.status, {
    error: { code: error.code, message: error.message, ...error.details },
  }, origin);
}

function parseCanonicalUint(value: string, label: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} is invalid.`);
  const parsed = BigInt(value);
  if (parsed > UINT64_MAX) throw new Error(`${label} exceeds uint64.`);
  return parsed;
}

function runtimeBinding(manifest: V3AttestationManifest): RuntimeBinding {
  if (
    manifest.schemaVersion !== 4
    || manifest.suiteVersion !== "3.0.0"
    || (manifest.releaseStatus !== "candidate" && manifest.releaseStatus !== "live")
    || !manifest.wiring.suiteConfigured
    || !/^sha256:[a-f0-9]{64}$/.test(manifest.suiteReleaseId)
    || !manifest.contracts.controller.address
    || !manifest.normalization.attestor
  ) {
    throw new PublicRequestError(503, "V3_ATTESTATION_UNAVAILABLE", "Normalization attestation is unavailable for this V3 release state.");
  }
  if (
    manifest.normalization.profileId !== SEPBASE_NORMALIZATION.profileIdentifier
    || manifest.normalization.profileHash.toLowerCase() !== SEPBASE_NORMALIZATION.profileHash
  ) {
    throw new PublicRequestError(503, "V3_PROFILE_MISMATCH", "The V3 normalization profile is not the reviewed ENSIP-15 profile.");
  }
  const controller = getAddress(manifest.contracts.controller.address);
  const attestor = getAddress(manifest.normalization.attestor);
  const minAgeSeconds = parseCanonicalUint(manifest.commitment.minAgeSeconds, "Commitment minimum age");
  const maxValiditySeconds = parseCanonicalUint(
    manifest.normalization.maxAttestationValiditySeconds,
    "Attestation validity",
  );
  if (minAgeSeconds < 60n || maxValiditySeconds < minAgeSeconds || maxValiditySeconds > 86_400n) {
    throw new PublicRequestError(503, "V3_ATTESTATION_WINDOW_INVALID", "The V3 attestation window cannot safely reach reveal readiness.");
  }
  return {
    suiteReleaseId: manifest.suiteReleaseId as `sha256:${string}`,
    chainId: manifest.chainId,
    suffix: manifest.suffix,
    controller,
    attestor,
    profileId: manifest.normalization.profileId,
    profileHash: manifest.normalization.profileHash.toLowerCase() as Hex,
    minAgeSeconds,
    maxValiditySeconds,
    nameRules: manifest.nameRules,
  };
}

function exactOrigin(request: Request, configuredOrigin: string) {
  const allowed = new URL(configuredOrigin).origin;
  const supplied = request.headers.get("origin");
  if (!supplied || supplied !== allowed) {
    throw new PublicRequestError(403, "ORIGIN_FORBIDDEN", "A request from the configured site origin is required.");
  }
  return allowed;
}

async function boundedText(responseOrRequest: { body: ReadableStream<Uint8Array> | null }, maximumBytes: number) {
  if (!responseOrRequest.body) return "";
  const reader = responseOrRequest.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new PublicRequestError(413, "BODY_TOO_LARGE", "Request body exceeds the allowed byte limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(joined);
  } catch {
    throw new PublicRequestError(400, "INVALID_UTF8", "Request body must be valid UTF-8 JSON.");
  }
}

async function readPublicBody(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new PublicRequestError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^(0|[1-9][0-9]*)$/.test(declared) || BigInt(declared) > BigInt(V3_ATTESTATION_MAX_REQUEST_BYTES))) {
    throw new PublicRequestError(413, "BODY_TOO_LARGE", "Request body exceeds the allowed byte limit.");
  }
  const body = await boundedText(request, V3_ATTESTATION_MAX_REQUEST_BYTES);
  try {
    return publicRequestSchema.parse(JSON.parse(body) as unknown);
  } catch {
    throw new PublicRequestError(400, "INVALID_REQUEST", "Request body does not match the strict attestation schema.");
  }
}

function assertRequestedScope(request: z.output<typeof publicRequestSchema>, binding: RuntimeBinding) {
  if (
    request.suiteReleaseId !== binding.suiteReleaseId
    || request.chainId !== binding.chainId
    || request.controller !== binding.controller
    || request.normalizationProfileId !== binding.profileId
    || request.normalizationProfileHash !== binding.profileHash
    || request.attestor !== binding.attestor
  ) {
    throw new PublicRequestError(409, "ATTESTATION_SCOPE_MISMATCH", "The requested attestation scope does not match the current V3 release.");
  }
}

function assertCanonicalSignature(value: Hex) {
  const s = BigInt(`0x${value.slice(66, 130)}`);
  const v = Number.parseInt(value.slice(130, 132), 16);
  if (s === 0n || s > HALF_CURVE_ORDER || (v !== 27 && v !== 28)) {
    throw new Error("Issuer signature is not canonical ECDSA.");
  }
}

async function readIssuerResponse(response: Response) {
  if (response.status !== 200 || response.url && response.redirected) throw new Error("Issuer rejected the request.");
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new Error("Issuer returned an invalid media type.");
  }
  const declared = response.headers.get("content-length");
  if (declared && (!/^(0|[1-9][0-9]*)$/.test(declared) || BigInt(declared) > BigInt(V3_ATTESTATION_MAX_ISSUER_RESPONSE_BYTES))) {
    throw new Error("Issuer response is too large.");
  }
  let body: string;
  try {
    body = await boundedText(response, V3_ATTESTATION_MAX_ISSUER_RESPONSE_BYTES);
  } catch {
    throw new Error("Issuer response is too large or invalid.");
  }
  try {
    return issuerResponseSchema.parse(JSON.parse(body) as unknown);
  } catch {
    throw new Error("Issuer returned an invalid response.");
  }
}

export async function handleV3NormalizationAttestation(
  request: Request,
  options: V3AttestationHandlerOptions,
) {
  let origin: string | undefined;
  try {
    // Release/runtime readiness intentionally precedes body parsing, secret reads and issuer I/O.
    const binding = runtimeBinding(options.manifest);
    origin = exactOrigin(request, options.allowedOrigin);
    const input = await readPublicBody(request);
    assertRequestedScope(input, binding);

    let normalized;
    try {
      normalized = normalizeName(input.rawInput, binding.suffix, {
        minCodePoints: binding.nameRules.minCodepoints,
        maxCodePoints: binding.nameRules.maxCodepoints,
        maxUtf8Bytes: binding.nameRules.maxUtf8Bytes,
      });
    } catch (error) {
      const code = error instanceof NameNormalizationError ? error.code : "INVALID_NAME";
      throw new PublicRequestError(422, "NORMALIZATION_FAILED", "The name is not valid under the reviewed ENSIP-15 profile.", {
        normalizationCode: code,
      });
    }
    const needsConfirmation = input.rawInput.trim() !== normalized.normalizedLabel;
    if (
      (needsConfirmation && input.canonicalLabel !== normalized.normalizedLabel)
      || (input.canonicalLabel !== undefined && input.canonicalLabel !== normalized.normalizedLabel)
    ) {
      throw new PublicRequestError(409, "CANONICAL_CONFIRMATION_REQUIRED", "Confirm the exact canonical label before requesting an attestation.", {
        normalizedSuggestion: normalized.normalizedLabel,
        normalizedFullName: normalized.normalizedFullName,
      });
    }

    let issuerConfig: V3AttestationIssuerConfig;
    try {
      issuerConfig = options.readIssuerConfig();
    } catch {
      throw new PublicRequestError(503, "ATTESTATION_ISSUER_UNAVAILABLE", "The external normalization issuer is unavailable.");
    }
    const now = (options.now ?? (() => BigInt(Math.floor(Date.now() / 1_000))))();
    if (now < 0n || now > UINT64_MAX) throw new Error("Clock is outside uint64 bounds.");
    const issuerRequest = {
      schemaVersion: V3_ATTESTATION_REQUEST_SCHEMA_VERSION,
      suiteReleaseId: binding.suiteReleaseId,
      chainId: binding.chainId,
      controller: binding.controller,
      normalizationProfileId: binding.profileId,
      normalizationProfileHash: binding.profileHash,
      label: normalized.normalizedLabel,
      labelHash: normalized.labelHash,
      recipient: input.recipient,
      attestor: binding.attestor,
      requestedAt: now.toString(),
      maxValidUntil: (now + binding.maxValiditySeconds).toString(),
    };
    const response = await (options.fetcher ?? fetch)(issuerConfig.endpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(5_000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: issuerConfig.authorization,
        "X-Sepbase-Suite-Release": binding.suiteReleaseId,
      },
      body: JSON.stringify(issuerRequest),
    });
    const issued = await readIssuerResponse(response);
    if (
      issued.suiteReleaseId !== binding.suiteReleaseId
      || issued.chainId !== binding.chainId
      || issued.controller !== binding.controller
      || issued.normalizationProfileId !== binding.profileId
      || issued.normalizationProfileHash !== binding.profileHash
      || issued.label !== normalized.normalizedLabel
      || issued.labelHash !== normalized.labelHash
      || issued.recipient !== input.recipient
      || issued.attestor !== binding.attestor
    ) throw new Error("Issuer response scope mismatch.");

    const validUntil = BigInt(issued.validUntil);
    const verifiedAt = (options.now ?? (() => BigInt(Math.floor(Date.now() / 1_000))))();
    if (
      validUntil < verifiedAt + binding.minAgeSeconds
      || validUntil > now + binding.maxValiditySeconds
    ) throw new Error("Issuer validity window is unsafe.");
    assertCanonicalSignature(issued.signature);
    const typedDataDigest = hashTypedData({
      domain: {
        name: "ChainNameControllerV3",
        version: "3",
        chainId: binding.chainId,
        verifyingContract: binding.controller,
      },
      types: {
        NormalizationAttestation: [
          { name: "chainId", type: "uint256" },
          { name: "controller", type: "address" },
          { name: "normalizationProfileHash", type: "bytes32" },
          { name: "labelHash", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "validUntil", type: "uint64" },
        ],
      },
      primaryType: "NormalizationAttestation",
      message: {
        chainId: BigInt(binding.chainId),
        controller: binding.controller,
        normalizationProfileHash: binding.profileHash,
        labelHash: normalized.labelHash,
        recipient: input.recipient,
        validUntil,
      },
    });
    const recovered = getAddress(await recoverAddress({ hash: typedDataDigest, signature: issued.signature }));
    if (recovered !== binding.attestor) throw new Error("Issuer signature recovery mismatch.");
    const controllerAttestationHash = hashV3NormalizationAttestation({ validUntil, signature: issued.signature });

    return json(200, {
      data: {
        schemaVersion: V3_ATTESTATION_REQUEST_SCHEMA_VERSION,
        suiteReleaseId: binding.suiteReleaseId,
        chainId: binding.chainId,
        controller: binding.controller,
        normalizationProfileId: binding.profileId,
        normalizationProfileHash: binding.profileHash,
        normalizedLabel: normalized.normalizedLabel,
        normalizedFullName: normalized.normalizedFullName,
        labelHash: normalized.labelHash,
        recipient: input.recipient,
        attestor: binding.attestor,
        validUntil: validUntil.toString(),
        signature: issued.signature,
        typedDataDigest,
        controllerAttestationHash,
      },
    }, origin);
  } catch (error) {
    if (error instanceof PublicRequestError) return errorResponse(error, origin);
    return errorResponse(new PublicRequestError(
      502,
      "ATTESTATION_VERIFICATION_FAILED",
      "The external issuer response failed local scope and signature verification.",
    ), origin);
  }
}

export function v3NormalizationAttestationOptions(request: Request, options: Pick<V3AttestationHandlerOptions, "manifest" | "allowedOrigin">) {
  try {
    runtimeBinding(options.manifest);
    const origin = exactOrigin(request, options.allowedOrigin);
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      },
    });
  } catch (error) {
    return errorResponse(error instanceof PublicRequestError ? error : new PublicRequestError(503, "V3_ATTESTATION_UNAVAILABLE", "Normalization attestation is unavailable."));
  }
}
