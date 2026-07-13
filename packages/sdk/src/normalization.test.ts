import { describe, expect, it } from "vitest";
import { keccak256, namehash, toBytes } from "viem";
import conformance from "../../../fixtures/name-normalization.json";
import {
  NameNormalizationError,
  SEPBASE_NORMALIZATION,
  assertCanonicalLabel,
  normalizeName,
  normalizeSuffix,
} from "./normalization";

describe("ENSIP-15 canonical names", () => {
  it("passes the shared normalization conformance corpus", () => {
    const limits = {
      minCodePoints: conformance.profile.minCodePoints,
      maxCodePoints: conformance.profile.maxCodePoints,
      maxUtf8Bytes: conformance.profile.maxUtf8Bytes,
    };
    for (const fixture of conformance.valid) {
      expect(
        normalizeName(fixture.input, conformance.profile.suffix, limits).normalizedLabel,
        fixture.id,
      ).toBe(fixture.normalizedLabel);
    }
    for (const fixture of conformance.invalid) {
      expect(
        () => normalizeName(fixture.input, conformance.profile.suffix, limits),
        fixture.id,
      ).toThrowError(expect.objectContaining({ code: fixture.errorCode }));
    }
  });

  it("normalizes ASCII case and an optional configured suffix", () => {
    const label = normalizeName("Alice", "sepbase");
    const fullName = normalizeName("ALICE.SEPBASE", ".sepbase");

    expect(label.normalizedLabel).toBe("alice");
    expect(label.normalizedFullName).toBe("alice.sepbase");
    expect(label.changed).toBe(true);
    expect(fullName.labelHash).toBe(label.labelHash);
    expect(fullName.node).toBe(label.node);
    expect(fullName.tokenId).toBe(label.tokenId);
  });

  it("uses the same identity for composed and decomposed Unicode", () => {
    const composed = normalizeName("é", "sepbase");
    const decomposed = normalizeName("e\u0301", "sepbase");

    expect(decomposed.normalizedLabel).toBe(composed.normalizedLabel);
    expect(decomposed.labelHash).toBe(composed.labelHash);
    expect(decomposed.node).toBe(composed.node);
  });

  it("supports normalized emoji labels", () => {
    const normalized = normalizeName("🚴‍♂️", "sepbase");
    expect(normalized.normalizedFullName.endsWith(".sepbase")).toBe(true);
    expect(normalized.codePointLength).toBeGreaterThan(0);
  });

  it("rejects mixed-script confusables and subdomains", () => {
    expect(() => normalizeName("aа", "sepbase")).toThrow(NameNormalizationError);
    expect(() => normalizeName("sub.alice.sepbase", "sepbase")).toThrowError(
      expect.objectContaining({ code: "SUBDOMAIN_NOT_SUPPORTED" }),
    );
  });

  it("enforces canonical machine input with a safe suggestion", () => {
    expect(() => assertCanonicalLabel("Alice.sepbase", "sepbase")).toThrowError(
      expect.objectContaining({
        code: "NON_CANONICAL_INPUT",
        normalizedSuggestion: "alice",
      }),
    );
    expect(assertCanonicalLabel("alice", "sepbase").normalizedLabel).toBe("alice");
  });

  it("binds the normalized full name to the ENS node", () => {
    const normalized = normalizeName("alice", "sepbase");
    expect(normalized.node).toBe(namehash("alice.sepbase"));
    expect(normalizeSuffix(".SEPBASE")).toBe("sepbase");
    expect(SEPBASE_NORMALIZATION.standard).toBe("ENSIP-15");
    expect(SEPBASE_NORMALIZATION.profileHash).toBe(
      keccak256(toBytes(SEPBASE_NORMALIZATION.profileIdentifier)),
    );
  });

  it("enforces code-point and UTF-8 byte limits independently", () => {
    expect(() => normalizeName("abcd", "sepbase", { maxCodePoints: 3 })).toThrowError(
      expect.objectContaining({ code: "LABEL_LENGTH" }),
    );
    expect(() => normalizeName("💩", "sepbase", { maxUtf8Bytes: 3 })).toThrowError(
      expect.objectContaining({ code: "LABEL_BYTES" }),
    );
  });
});
