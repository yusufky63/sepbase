import { describe, expect, it } from "vitest";
import { hashV3NormalizationAttestation } from "@sepbase/sdk";
import type { Hex } from "viem";
import {
  V3_REGISTRATION_SESSION_EXPORT_MAX_BYTES,
  V3_REGISTRATION_JOURNAL_STORAGE_KEY,
  V3_REGISTRATION_SESSION_MAX_ENTRIES,
  V3_REGISTRATION_SESSION_STORAGE_KEY,
  V3_REGISTRATION_SESSION_SECRET_WARNING,
  exportV3RegistrationJournal,
  exportV3RegistrationSession,
  generateV3RegistrationSecret,
  importV3RegistrationJournal,
  importV3RegistrationSession,
  loadV3RegistrationJournals,
  loadV3RegistrationSessions,
  parseV3RegistrationSession,
  pruneV3RegistrationRecovery,
  storeV3RegistrationJournal,
  storeV3RegistrationSession,
  type V3RegistrationJournal,
  type V3RegistrationSession,
  type V3RegistrationSessionStorage,
} from "./v3-registration-session";

const signature = `0x${"11".repeat(64)}1b` as Hex;
const validUntil = 1_900n;
const attestationHash = hashV3NormalizationAttestation({ validUntil, signature });

function hash(byte: string) {
  return `0x${BigInt(`0x${byte}`).toString(16).padStart(64, "0")}` as Hex;
}

function session(overrides: Partial<V3RegistrationSession> = {}): V3RegistrationSession {
  return {
    schemaVersion: 1,
    suiteReleaseId: `sha256:${"a".repeat(64)}`,
    chainId: 84_532,
    controller: "0x1000000000000000000000000000000000000001",
    preparedAtBlock: "100",
    suffix: "sepbase",
    label: "alice",
    node: "0x992aeeff1b7b12d344ad4f8e1b40c032e479e3c4081c13c7dbc5ce5a8ce40f5a",
    payer: "0x2000000000000000000000000000000000000002",
    recipient: "0x3000000000000000000000000000000000000003",
    durationYears: 1,
    referrer: "0x0000000000000000000000000000000000000000",
    expectedAmount: "500",
    expectedReferralRewardBps: 1_000,
    resolverInitializationHash: hash("3"),
    resolverInitialization: {
      addressRecord: "0x3000000000000000000000000000000000000003",
      textRecords: [],
    },
    normalizationAttestationHash: attestationHash,
    normalizationTypedDataDigest: hash("4"),
    commitment: hash("5"),
    secret: hash("6"),
    attestation: { validUntil: validUntil.toString(), signature },
    commit: {
      transactionHash: hash("7"),
      confirmedAt: "900",
      earliestRevealAt: "960",
      latestRevealAt: "2000",
    },
    ...overrides,
  };
}

function journal(overrides: Partial<V3RegistrationJournal> = {}): V3RegistrationJournal {
  const { commit, ...material } = session();
  void commit;
  return {
    ...material,
    submittedTransactionHash: null,
    ...overrides,
  };
}

class MemoryStorage implements V3RegistrationSessionStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("V3 browser registration sessions", () => {
  it("uses only a cryptographically secure source for non-zero bytes32 secrets", () => {
    const cryptoSource = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array instanceof Uint8Array) array.fill(0x7a);
        return array;
      },
    };
    expect(generateV3RegistrationSecret(cryptoSource)).toBe(`0x${"7a".repeat(32)}`);
    expect(() => generateV3RegistrationSecret(undefined)).not.toThrow();
    expect(() => generateV3RegistrationSecret({
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array instanceof Uint8Array) array.fill(0);
        return array;
      },
    })).toThrow(/invalid secret/);
  });

  it("strictly validates the attestation hash and JSON shape", () => {
    expect(parseV3RegistrationSession(session()).normalizationAttestationHash).toBe(attestationHash);
    expect(() => parseV3RegistrationSession({ ...session(), unexpected: true })).toThrow();
    expect(() => parseV3RegistrationSession({ ...session(), label: "Alice" })).toThrow(/ENSIP-15 canonical/);
    expect(() => parseV3RegistrationSession({ ...session(), node: hash("2") })).toThrow(/canonical result/);
    expect(() => parseV3RegistrationSession({
      ...session(),
      normalizationAttestationHash: hash("9"),
    })).toThrow(/Attestation hash/);
  });

  it("exports and imports only an exact suite, account, commitment and attestation scope", () => {
    const current = session();
    const serialized = exportV3RegistrationSession(current);
    expect(V3_REGISTRATION_SESSION_SECRET_WARNING).toMatch(/secret.*URLs.*logs.*analytics.*XSS/i);
    expect(serialized).toContain(current.secret);
    expect(importV3RegistrationSession(serialized, current)).toEqual(current);
    expect(() => importV3RegistrationSession(serialized, {
      ...current,
      payer: "0x4000000000000000000000000000000000000004",
    })).toThrow(/another exact commitment scope/);
    expect(() => importV3RegistrationSession(`${serialized.slice(0, -1)},"extra":true}`, current)).toThrow();
    expect(() => importV3RegistrationSession("x".repeat(V3_REGISTRATION_SESSION_EXPORT_MAX_BYTES + 1), current))
      .toThrow(/byte limit/);
  });

  it("never trusts device time for parsing and only prunes with an explicit confirmed-chain timestamp", () => {
    const storage = new MemoryStorage();
    expect(storeV3RegistrationSession(session(), storage)).toMatchObject({ ok: true });
    expect(loadV3RegistrationSessions(storage)).toMatchObject({
      ok: true,
      sessions: [{ label: "alice" }],
      storageState: "available",
    });
    expect(loadV3RegistrationSessions(storage)).toMatchObject({ sessions: [{ label: "alice" }] });
    expect(pruneV3RegistrationRecovery(storage, 1_901n)).toBe(true);
    expect(loadV3RegistrationSessions(storage)).toMatchObject({ sessions: [] });
    expect(storage.getItem(V3_REGISTRATION_SESSION_STORAGE_KEY)).toBeNull();
    expect(storeV3RegistrationSession(session(), null)).toEqual({
      ok: false,
      reason: "storage-unavailable",
    });
  });

  it("enforces the bounded entry count without silently evicting active secrets", () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < V3_REGISTRATION_SESSION_MAX_ENTRIES; index += 1) {
      const byte = (index + 16).toString(16).padStart(2, "0");
      expect(storeV3RegistrationSession(session({ commitment: hash(byte) }), storage))
        .toMatchObject({ ok: true });
    }
    expect(storeV3RegistrationSession(session({ commitment: hash("ff") }), storage)).toEqual({
      ok: false,
      reason: "entry-limit",
    });
    const loaded = loadV3RegistrationSessions(storage);
    expect(loaded.ok && loaded.sessions).toHaveLength(V3_REGISTRATION_SESSION_MAX_ENTRIES);
  });

  it("durably journals reveal material before submission and supports a nullable transaction hash", () => {
    const storage = new MemoryStorage();
    const prepared = journal();
    expect(storeV3RegistrationJournal(prepared, storage)).toMatchObject({
      ok: true,
      journal: { secret: prepared.secret, submittedTransactionHash: null },
    });
    expect(storage.getItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY)).toContain(prepared.secret);

    const submitted = { ...prepared, submittedTransactionHash: hash("77") };
    expect(storeV3RegistrationJournal(submitted, storage)).toMatchObject({
      ok: true,
      journal: { submittedTransactionHash: hash("77") },
    });
    expect(loadV3RegistrationJournals(storage)).toMatchObject({
      journals: [{ commitment: prepared.commitment, submittedTransactionHash: hash("77") }],
    });

    const serialized = exportV3RegistrationJournal(prepared);
    expect(importV3RegistrationJournal(serialized, prepared)).toEqual(prepared);
    expect(parseV3RegistrationSession(session({
      commit: { ...session().commit, transactionHash: null },
    })).commit.transactionHash).toBeNull();
  });

  it("fails chain-time pruning closed when storage cannot be persisted", () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_REGISTRATION_SESSION_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      sessions: [session()],
    }));
    const readOnly: V3RegistrationSessionStorage = {
      getItem: storage.getItem.bind(storage),
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(pruneV3RegistrationRecovery(readOnly, 1_901n)).toBe(false);
    expect(loadV3RegistrationSessions(readOnly)).toMatchObject({ sessions: [session()] });
  });
});
