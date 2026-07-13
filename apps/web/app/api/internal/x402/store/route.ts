import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { encryptedJsonCodecFromEnvironment } from "@/lib/x402/cas/crypto";
import { handleCasRequest } from "@/lib/x402/cas/handler";
import { createNeonCasDatabase } from "@/lib/x402/cas/neon-database";
import { casRequestSchema } from "@/lib/x402/cas/protocol";
import { CasStoreError, EncryptedCasStore } from "@/lib/x402/cas/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_REQUEST_BYTES = 512 * 1024;
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(value, {
    status,
    headers: { ...responseHeaders, ...headers },
  });
}

function error(status: number, code: string, message: string, headers?: HeadersInit) {
  return json({ error: { code, message } }, status, headers);
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function authorize(request: Request) {
  const configured = process.env.X402_IDEMPOTENCY_STORE_AUTH_TOKEN?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (configured.length < 24) {
    throw new CasStoreError(503, "CAS_AUTH_NOT_CONFIGURED", "The encrypted x402 store is unavailable.");
  }
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || !timingSafeEqual(digest(configured), digest(supplied))) {
    throw new CasStoreError(401, "CAS_UNAUTHORIZED", "Bearer authentication is required.");
  }
}

async function readBoundedJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new CasStoreError(415, "CAS_CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) {
    throw new CasStoreError(413, "CAS_REQUEST_TOO_LARGE", "The encrypted x402 store request is too large.");
  }
  if (!request.body) throw new CasStoreError(400, "CAS_BODY_REQUIRED", "A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new CasStoreError(413, "CAS_REQUEST_TOO_LARGE", "The encrypted x402 store request is too large.");
    }
    chunks.push(result.value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  try {
    return JSON.parse(buffer.toString("utf8")) as unknown;
  } catch {
    throw new CasStoreError(400, "CAS_INVALID_JSON", "The encrypted x402 store request is not valid JSON.");
  }
}

export async function POST(request: Request) {
  let database: ReturnType<typeof createNeonCasDatabase> | null = null;
  try {
    authorize(request);
    const codec = encryptedJsonCodecFromEnvironment();
    database = createNeonCasDatabase();
    await database.ping();
    const parsed = casRequestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return error(400, "CAS_INVALID_REQUEST", "The encrypted x402 store request is invalid.");
    }
    const result = await handleCasRequest(new EncryptedCasStore(database, codec), parsed.data);
    return json(result);
  } catch (caught) {
    if (caught instanceof CasStoreError) {
      return error(
        caught.status,
        caught.code,
        caught.message,
        caught.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined,
      );
    }
    return error(503, "CAS_UNAVAILABLE", "The encrypted x402 store is unavailable.");
  } finally {
    if (database) {
      try {
        await database.close();
      } catch {
        // The response remains fail-closed even if connection cleanup fails.
      }
    }
  }
}
