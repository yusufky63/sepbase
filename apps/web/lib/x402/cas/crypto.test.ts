import { describe, expect, it } from "vitest";
import { EncryptedJsonCodec, canonicalSha256 } from "./crypto";

const key = Buffer.alloc(32, 7).toString("base64url");
const context = {
  entity: "reservation" as const,
  primaryId: "payment_identifier_001",
  secondaryId: `sha256:${"a".repeat(64)}`,
};

describe("EncryptedJsonCodec", () => {
  it("encrypts with randomized AES-256-GCM envelopes and binding AAD", () => {
    const codec = new EncryptedJsonCodec("key-2026-01", key);
    const value = { payment: "sensitive-authorization", nested: { amount: "500" } };
    const first = codec.encrypt(value, context);
    const second = codec.encrypt(value, context);

    expect(first.algorithm).toBe("A256GCM");
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain("sensitive-authorization");
    expect(codec.decrypt(first, context)).toEqual(value);
    expect(() => codec.decrypt(first, { ...context, secondaryId: `sha256:${"b".repeat(64)}` }))
      .toThrow();
  });

  it("rejects tampering and non-canonical key material", () => {
    const codec = new EncryptedJsonCodec("key-2026-01", key);
    const envelope = codec.encrypt({ secret: "value" }, context);
    expect(() => codec.decrypt({ ...envelope, ciphertext: `A${envelope.ciphertext.slice(1)}` }, context))
      .toThrow();
    expect(() => new EncryptedJsonCodec("key-2026-01", "not-a-key")).toThrow();
  });

  it("hashes canonical JSON independently of object key order", () => {
    expect(canonicalSha256({ b: 2, a: 1 })).toBe(canonicalSha256({ a: 1, b: 2 }));
  });
});
