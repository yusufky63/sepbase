import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const encryptedEnvelopeSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal("A256GCM"),
  keyId: z.string().regex(KEY_ID),
  iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  ciphertext: z.string().min(1).max(1024 * 1024).regex(/^[A-Za-z0-9_-]+$/),
  tag: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
}).strict();

export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;

export type EncryptionContext = {
  entity: "prepared-plan" | "challenge" | "reservation" | "settlement-response";
  primaryId: string;
  secondaryId: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Unsupported JSON value");
}

function associatedData(context: EncryptionContext) {
  return Buffer.from(
    `sepbase:x402:cas:v1:${context.entity}:${context.primaryId}:${context.secondaryId}`,
    "utf8",
  );
}

function decodeKey(value: string) {
  if (!BASE64URL_32_BYTES.test(value)) {
    throw new Error("X402_STORE_ENCRYPTION_KEY must be an unpadded base64url-encoded 32-byte key.");
  }
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value) {
    throw new Error("X402_STORE_ENCRYPTION_KEY is not canonical base64url.");
  }
  return key;
}

export function canonicalSha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function secretTokenHash(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function createLeaseToken() {
  return randomBytes(32).toString("base64url");
}

export class EncryptedJsonCodec {
  readonly #key: Buffer;

  constructor(readonly keyId: string, keyValue: string) {
    if (!KEY_ID.test(keyId)) {
      throw new Error("X402_STORE_ENCRYPTION_KEY_ID is invalid.");
    }
    this.#key = decodeKey(keyValue);
  }

  encrypt(value: unknown, context: EncryptionContext): EncryptedEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(associatedData(context));
    const ciphertext = Buffer.concat([
      cipher.update(canonicalJson(value), "utf8"),
      cipher.final(),
    ]);
    return {
      version: 1,
      algorithm: "A256GCM",
      keyId: this.keyId,
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    };
  }

  decrypt(envelopeValue: unknown, context: EncryptionContext): unknown {
    const envelope = encryptedEnvelopeSchema.parse(envelopeValue);
    if (envelope.keyId !== this.keyId) {
      throw new Error("The encrypted x402 record uses an unavailable key identifier.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as unknown;
  }
}

export function encryptedJsonCodecFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
) {
  const keyId = environment.X402_STORE_ENCRYPTION_KEY_ID?.trim() ?? "";
  const key = environment.X402_STORE_ENCRYPTION_KEY?.trim() ?? "";
  return new EncryptedJsonCodec(keyId, key);
}
