import {
  bytesToHex,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import { hashV3NormalizationAttestation, normalizeName } from "@sepbase/sdk";

export const V3_REGISTRATION_SESSION_SCHEMA_VERSION = 1 as const;
export const V3_REGISTRATION_SESSION_STORAGE_KEY = "sepbase:v3:registration-sessions:v1";
export const V3_REGISTRATION_JOURNAL_STORAGE_KEY = "sepbase:v3:registration-journals:v1";
export const V3_REGISTRATION_SESSION_MAX_ENTRIES = 12;
export const V3_REGISTRATION_SESSION_MAX_BYTES = 64 * 1024;
export const V3_REGISTRATION_SESSION_EXPORT_MAX_BYTES = 16 * 1024;
export const V3_REGISTRATION_SESSION_SECRET_WARNING =
  "This explicit recovery export contains the commitment secret. Keep it off URLs, logs and analytics; localStorage is not an XSS security boundary.";

const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const textEncoder = new TextEncoder();

const canonicalDecimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const uint64 = canonicalDecimal.refine((value) => BigInt(value) <= UINT64_MAX, "Must fit uint64.");
const uint256 = canonicalDecimal.refine((value) => BigInt(value) <= UINT256_MAX, "Must fit uint256.");
const suiteReleaseId = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value): Hex => value.toLowerCase() as Hex);
const nonZeroBytes32 = bytes32.refine((value) => value !== ZERO_BYTES32, "Must not be zero bytes32.");
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/)
  .transform((value): Hex => value.toLowerCase() as Hex);
const address = z.string().refine(isAddress, "Must be a valid EVM address.")
  .transform((value): Address => getAddress(value));
const nonZeroAddress = address.refine(
  (value) => value !== "0x0000000000000000000000000000000000000000",
  "Must not be the zero address.",
);
const boundedUtf8 = (maximum: number) => z.string().refine(
  (value) => textEncoder.encode(value).byteLength <= maximum,
  `Must not exceed ${maximum} UTF-8 bytes.`,
);

const resolverInitializationSchema = z.object({
  addressRecord: address,
  textRecords: z.array(z.object({
    key: boundedUtf8(64).refine((value) => value.length > 0, "Text key cannot be empty."),
    value: boundedUtf8(512),
  }).strict()).max(10),
}).strict().superRefine((value, context) => {
  const keys = new Set<string>();
  for (const [index, record] of value.textRecords.entries()) {
    if (keys.has(record.key)) {
      context.addIssue({ code: "custom", path: ["textRecords", index, "key"], message: "Duplicate text key." });
    }
    keys.add(record.key);
  }
});

const registrationMaterialShape = {
  schemaVersion: z.literal(V3_REGISTRATION_SESSION_SCHEMA_VERSION),
  suiteReleaseId,
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  controller: nonZeroAddress,
  preparedAtBlock: uint256,
  suffix: z.string().regex(/^[a-z0-9]{1,32}$/),
  label: boundedUtf8(96).refine((value) => value.length > 0 && !value.includes("."), "Label must be canonical and unqualified."),
  node: nonZeroBytes32,
  payer: nonZeroAddress,
  recipient: nonZeroAddress,
  durationYears: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  referrer: address,
  expectedAmount: uint256,
  expectedReferralRewardBps: z.number().int().min(0).max(2_000),
  resolverInitializationHash: nonZeroBytes32,
  resolverInitialization: resolverInitializationSchema,
  normalizationAttestationHash: nonZeroBytes32,
  normalizationTypedDataDigest: nonZeroBytes32,
  commitment: nonZeroBytes32,
  secret: nonZeroBytes32,
  attestation: z.object({
    validUntil: uint64,
    signature,
  }).strict(),
};
const registrationMaterialSchema = z.object(registrationMaterialShape).strict();

function validateRegistrationMaterial(
  session: z.output<typeof registrationMaterialSchema>,
  context: z.RefinementCtx,
) {
  try {
    const normalized = normalizeName(session.label, session.suffix, {
      minCodePoints: 1,
      maxCodePoints: 32,
      maxUtf8Bytes: 96,
    });
    if (normalized.normalizedLabel !== session.label || normalized.node !== session.node) {
      context.addIssue({
        code: "custom",
        path: ["label"],
        message: "Stored label/node must exactly match the pinned ENSIP-15 canonical result.",
      });
    }
  } catch {
    context.addIssue({ code: "custom", path: ["label"], message: "Stored label is not ENSIP-15 canonical." });
  }

  try {
    const calculatedHash = hashV3NormalizationAttestation({
      validUntil: BigInt(session.attestation.validUntil),
      signature: session.attestation.signature,
    });
    if (calculatedHash !== session.normalizationAttestationHash) {
      context.addIssue({
        code: "custom",
        path: ["normalizationAttestationHash"],
        message: "Attestation hash does not match the exact stored signature and validity.",
      });
    }
  } catch {
    context.addIssue({ code: "custom", path: ["attestation"], message: "Attestation is invalid." });
  }
}

export const v3RegistrationSessionSchema = registrationMaterialSchema.extend({
  commit: z.object({
    transactionHash: nonZeroBytes32.nullable(),
    confirmedAt: uint64,
    earliestRevealAt: uint64,
    latestRevealAt: uint64,
  }).strict(),
}).superRefine((session, context) => {
  validateRegistrationMaterial(session, context);
  const confirmedAt = BigInt(session.commit.confirmedAt);
  const earliestRevealAt = BigInt(session.commit.earliestRevealAt);
  const latestRevealAt = BigInt(session.commit.latestRevealAt);
  const attestationValidUntil = BigInt(session.attestation.validUntil);

  if (earliestRevealAt < confirmedAt) {
    context.addIssue({ code: "custom", path: ["commit", "earliestRevealAt"], message: "Earliest reveal cannot predate confirmation." });
  }
  if (latestRevealAt <= earliestRevealAt) {
    context.addIssue({ code: "custom", path: ["commit", "latestRevealAt"], message: "Latest reveal must follow earliest reveal." });
  }
  if (attestationValidUntil < earliestRevealAt) {
    context.addIssue({ code: "custom", path: ["attestation", "validUntil"], message: "Attestation must reach reveal readiness." });
  }

});

export type V3RegistrationSession = z.output<typeof v3RegistrationSessionSchema>;

export const v3RegistrationJournalSchema = registrationMaterialSchema.extend({
  submittedTransactionHash: nonZeroBytes32.nullable(),
}).superRefine(validateRegistrationMaterial);

export type V3RegistrationJournal = z.output<typeof v3RegistrationJournalSchema>;

const storageEnvelopeSchema = z.object({
  schemaVersion: z.literal(V3_REGISTRATION_SESSION_SCHEMA_VERSION),
  sessions: z.array(v3RegistrationSessionSchema).max(V3_REGISTRATION_SESSION_MAX_ENTRIES),
}).strict().superRefine((value, context) => {
  const commitments = new Set<string>();
  for (const [index, session] of value.sessions.entries()) {
    const commitmentScope = v3RegistrationCommitmentScopeKey(session);
    if (commitments.has(commitmentScope)) {
      context.addIssue({ code: "custom", path: ["sessions", index], message: "Duplicate commitment scope." });
    }
    commitments.add(commitmentScope);
  }
});

const exportEnvelopeSchema = z.object({
  format: z.literal("sepbase-v3-registration-session"),
  schemaVersion: z.literal(V3_REGISTRATION_SESSION_SCHEMA_VERSION),
  session: v3RegistrationSessionSchema,
}).strict();

const journalStorageEnvelopeSchema = z.object({
  schemaVersion: z.literal(V3_REGISTRATION_SESSION_SCHEMA_VERSION),
  journals: z.array(v3RegistrationJournalSchema).max(V3_REGISTRATION_SESSION_MAX_ENTRIES),
}).strict().superRefine((value, context) => {
  const commitments = new Set<string>();
  for (const [index, journal] of value.journals.entries()) {
    const commitmentScope = v3RegistrationCommitmentScopeKey(journal);
    if (commitments.has(commitmentScope)) {
      context.addIssue({ code: "custom", path: ["journals", index], message: "Duplicate commitment scope." });
    }
    commitments.add(commitmentScope);
  }
});

const journalExportEnvelopeSchema = z.object({
  format: z.literal("sepbase-v3-registration-journal"),
  schemaVersion: z.literal(V3_REGISTRATION_SESSION_SCHEMA_VERSION),
  journal: v3RegistrationJournalSchema,
}).strict();

const registrationSessionScopeSchema = z.object({
  suiteReleaseId,
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  controller: nonZeroAddress,
  payer: nonZeroAddress,
  commitment: nonZeroBytes32,
  normalizationAttestationHash: nonZeroBytes32,
}).strict();

export type V3RegistrationSessionScope = Pick<
  V3RegistrationSession,
  "suiteReleaseId" | "chainId" | "controller" | "payer" | "commitment" | "normalizationAttestationHash"
>;

export type V3RegistrationSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type V3RegistrationSessionFailureReason =
  | "storage-unavailable"
  | "invalid-storage"
  | "entry-limit"
  | "invalid-session";

export type V3RegistrationSessionLoadResult =
  | { ok: true; sessions: V3RegistrationSession[]; storageState: "available" | "read-only" }
  | { ok: false; sessions: []; reason: V3RegistrationSessionFailureReason };

export type V3RegistrationSessionWriteResult =
  | { ok: true; session: V3RegistrationSession }
  | { ok: false; reason: V3RegistrationSessionFailureReason };

export type V3RegistrationJournalLoadResult =
  | { ok: true; journals: V3RegistrationJournal[]; storageState: "available" }
  | { ok: false; journals: []; reason: V3RegistrationSessionFailureReason };

export type V3RegistrationJournalWriteResult =
  | { ok: true; journal: V3RegistrationJournal }
  | { ok: false; reason: V3RegistrationSessionFailureReason };

function byteLength(value: string) {
  return textEncoder.encode(value).byteLength;
}

function parseJsonWithinLimit(value: string, maximumBytes: number): unknown {
  if (byteLength(value) > maximumBytes) throw new Error("Serialized registration session exceeds its byte limit.");
  return JSON.parse(value) as unknown;
}

function activeAt(session: V3RegistrationSession, now: bigint) {
  const effectiveExpiry = BigInt(session.commit.latestRevealAt) < BigInt(session.attestation.validUntil)
    ? BigInt(session.commit.latestRevealAt)
    : BigInt(session.attestation.validUntil);
  return now <= effectiveExpiry;
}

function journalRecoverableAt(journal: V3RegistrationJournal, now: bigint) {
  return now <= BigInt(journal.attestation.validUntil);
}

function browserStorage(): V3RegistrationSessionStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parseStorage(raw: string | null) {
  if (raw === null) return { schemaVersion: V3_REGISTRATION_SESSION_SCHEMA_VERSION, sessions: [] };
  return storageEnvelopeSchema.parse(parseJsonWithinLimit(raw, V3_REGISTRATION_SESSION_MAX_BYTES));
}

function serializeStorage(sessions: readonly V3RegistrationSession[]) {
  const parsed = storageEnvelopeSchema.parse({
    schemaVersion: V3_REGISTRATION_SESSION_SCHEMA_VERSION,
    sessions,
  });
  const serialized = JSON.stringify(parsed);
  if (byteLength(serialized) > V3_REGISTRATION_SESSION_MAX_BYTES) {
    throw new Error("Registration session storage exceeds its byte limit.");
  }
  return serialized;
}

function parseJournalStorage(raw: string | null) {
  if (raw === null) return { schemaVersion: V3_REGISTRATION_SESSION_SCHEMA_VERSION, journals: [] };
  return journalStorageEnvelopeSchema.parse(parseJsonWithinLimit(raw, V3_REGISTRATION_SESSION_MAX_BYTES));
}

function serializeJournalStorage(journals: readonly V3RegistrationJournal[]) {
  const parsed = journalStorageEnvelopeSchema.parse({
    schemaVersion: V3_REGISTRATION_SESSION_SCHEMA_VERSION,
    journals,
  });
  const serialized = JSON.stringify(parsed);
  if (byteLength(serialized) > V3_REGISTRATION_SESSION_MAX_BYTES) {
    throw new Error("Registration journal storage exceeds its byte limit.");
  }
  return serialized;
}

export function generateV3RegistrationSecret(
  cryptoSource: Pick<Crypto, "getRandomValues"> | undefined = globalThis.crypto,
): Hex {
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") {
    throw new Error("A cryptographically secure browser random source is required.");
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const secret = new Uint8Array(32);
    cryptoSource.getRandomValues(secret);
    if (secret.some((byte) => byte !== 0)) return bytesToHex(secret);
  }
  throw new Error("The cryptographically secure random source returned an invalid secret.");
}

export function v3RegistrationCommitmentScopeKey(session: V3RegistrationSessionScope) {
  return [
    session.suiteReleaseId,
    session.chainId,
    session.controller.toLowerCase(),
    session.payer.toLowerCase(),
    session.commitment.toLowerCase(),
  ].join(":");
}

export function v3RegistrationSessionScopeKey(session: V3RegistrationSessionScope) {
  return `${v3RegistrationCommitmentScopeKey(session)}:${session.normalizationAttestationHash.toLowerCase()}`;
}

export function parseV3RegistrationSession(value: unknown) {
  return v3RegistrationSessionSchema.parse(value);
}

export function parseV3RegistrationJournal(value: unknown) {
  return v3RegistrationJournalSchema.parse(value);
}

export function loadV3RegistrationSessions(
  storage: V3RegistrationSessionStorage | null = browserStorage(),
): V3RegistrationSessionLoadResult {
  if (!storage) return { ok: false, sessions: [], reason: "storage-unavailable" };
  let envelope: z.output<typeof storageEnvelopeSchema>;
  try {
    envelope = parseStorage(storage.getItem(V3_REGISTRATION_SESSION_STORAGE_KEY));
  } catch {
    return { ok: false, sessions: [], reason: "invalid-storage" };
  }

  return { ok: true, sessions: envelope.sessions, storageState: "available" };
}

export function storeV3RegistrationSession(
  input: unknown,
  storage: V3RegistrationSessionStorage | null = browserStorage(),
): V3RegistrationSessionWriteResult {
  if (!storage) return { ok: false, reason: "storage-unavailable" };
  let session: V3RegistrationSession;
  try {
    session = parseV3RegistrationSession(input);
  } catch {
    return { ok: false, reason: "invalid-session" };
  }
  const loaded = loadV3RegistrationSessions(storage);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };

  const key = v3RegistrationCommitmentScopeKey(session);
  const existingIndex = loaded.sessions.findIndex((entry) => v3RegistrationCommitmentScopeKey(entry) === key);
  if (existingIndex === -1 && loaded.sessions.length >= V3_REGISTRATION_SESSION_MAX_ENTRIES) {
    return { ok: false, reason: "entry-limit" };
  }
  if (
    existingIndex !== -1
    && loaded.sessions[existingIndex]?.normalizationAttestationHash !== session.normalizationAttestationHash
  ) {
    return { ok: false, reason: "invalid-session" };
  }

  const sessions = [...loaded.sessions];
  if (existingIndex === -1) sessions.push(session);
  else sessions[existingIndex] = session;
  try {
    storage.setItem(V3_REGISTRATION_SESSION_STORAGE_KEY, serializeStorage(sessions));
    return { ok: true, session };
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
}

export function removeV3RegistrationSession(
  scope: V3RegistrationSessionScope,
  storage: V3RegistrationSessionStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const loaded = loadV3RegistrationSessions(storage);
  if (!loaded.ok) return false;
  const targetKey = v3RegistrationSessionScopeKey(scope);
  const sessions = loaded.sessions.filter((session) => v3RegistrationSessionScopeKey(session) !== targetKey);
  try {
    if (sessions.length === 0) storage.removeItem(V3_REGISTRATION_SESSION_STORAGE_KEY);
    else storage.setItem(V3_REGISTRATION_SESSION_STORAGE_KEY, serializeStorage(sessions));
    return true;
  } catch {
    return false;
  }
}

/**
 * Explicit recovery export. The returned JSON contains the secret. Callers must show
 * V3_REGISTRATION_SESSION_SECRET_WARNING and deliver it only through a user-selected
 * file or clipboard action. Device-local storage is recovery convenience, not an XSS boundary.
 */
export function exportV3RegistrationSession(input: unknown) {
  const session = parseV3RegistrationSession(input);
  const serialized = JSON.stringify({
    format: "sepbase-v3-registration-session",
    schemaVersion: V3_REGISTRATION_SESSION_SCHEMA_VERSION,
    session,
  });
  if (byteLength(serialized) > V3_REGISTRATION_SESSION_EXPORT_MAX_BYTES) {
    throw new Error("Registration session export exceeds its byte limit.");
  }
  return serialized;
}

/**
 * Explicit recovery import. The selected wallet and commitment scope must match exactly.
 * The expected scope must come from the currently verified suite manifest/client context;
 * device-local JSON cannot independently prove that a suite release remains current.
 */
export function importV3RegistrationSession(
  serialized: string,
  expectedScope: V3RegistrationSessionScope,
) {
  const envelope = exportEnvelopeSchema.parse(
    parseJsonWithinLimit(serialized, V3_REGISTRATION_SESSION_EXPORT_MAX_BYTES),
  );
  const session = parseV3RegistrationSession(envelope.session);
  const parsedExpectedScope = registrationSessionScopeSchema.parse({
    suiteReleaseId: expectedScope.suiteReleaseId,
    chainId: expectedScope.chainId,
    controller: expectedScope.controller,
    payer: expectedScope.payer,
    commitment: expectedScope.commitment,
    normalizationAttestationHash: expectedScope.normalizationAttestationHash,
  });
  if (v3RegistrationSessionScopeKey(session) !== v3RegistrationSessionScopeKey(parsedExpectedScope)) {
    throw new Error("Imported registration session belongs to another exact commitment scope.");
  }
  return session;
}

export function loadV3RegistrationJournals(
  storage: V3RegistrationSessionStorage | null = browserStorage(),
): V3RegistrationJournalLoadResult {
  if (!storage) return { ok: false, journals: [], reason: "storage-unavailable" };
  try {
    const envelope = parseJournalStorage(storage.getItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY));
    return { ok: true, journals: envelope.journals, storageState: "available" };
  } catch {
    return { ok: false, journals: [], reason: "invalid-storage" };
  }
}

export function storeV3RegistrationJournal(
  input: unknown,
  storage: V3RegistrationSessionStorage | null = browserStorage(),
): V3RegistrationJournalWriteResult {
  if (!storage) return { ok: false, reason: "storage-unavailable" };
  let journal: V3RegistrationJournal;
  try {
    journal = parseV3RegistrationJournal(input);
  } catch {
    return { ok: false, reason: "invalid-session" };
  }
  const loaded = loadV3RegistrationJournals(storage);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const key = v3RegistrationCommitmentScopeKey(journal);
  const existingIndex = loaded.journals.findIndex((entry) => v3RegistrationCommitmentScopeKey(entry) === key);
  if (existingIndex === -1 && loaded.journals.length >= V3_REGISTRATION_SESSION_MAX_ENTRIES) {
    return { ok: false, reason: "entry-limit" };
  }
  if (
    existingIndex !== -1
    && loaded.journals[existingIndex]?.normalizationAttestationHash !== journal.normalizationAttestationHash
  ) return { ok: false, reason: "invalid-session" };

  const journals = [...loaded.journals];
  if (existingIndex === -1) journals.push(journal);
  else journals[existingIndex] = journal;
  try {
    storage.setItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY, serializeJournalStorage(journals));
    const verified = parseJournalStorage(storage.getItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY));
    const persisted = verified.journals.find((entry) => v3RegistrationCommitmentScopeKey(entry) === key);
    if (!persisted || persisted.submittedTransactionHash !== journal.submittedTransactionHash) {
      return { ok: false, reason: "storage-unavailable" };
    }
    return { ok: true, journal: persisted };
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
}

export function removeV3RegistrationJournal(
  scope: V3RegistrationSessionScope,
  storage: V3RegistrationSessionStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const loaded = loadV3RegistrationJournals(storage);
  if (!loaded.ok) return false;
  const targetKey = v3RegistrationSessionScopeKey(scope);
  const journals = loaded.journals.filter((journal) => v3RegistrationSessionScopeKey(journal) !== targetKey);
  try {
    if (journals.length === 0) storage.removeItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY);
    else storage.setItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY, serializeJournalStorage(journals));
    return true;
  } catch {
    return false;
  }
}

/**
 * Destructive cleanup is intentionally explicit and requires a timestamp read from a
 * confirmed chain block. Storage parsing/import/export never consults the device clock.
 */
export function pruneV3RegistrationRecovery(
  storage: V3RegistrationSessionStorage | null,
  confirmedChainTimestamp: bigint,
) {
  if (!storage || confirmedChainTimestamp < 0n || confirmedChainTimestamp > UINT64_MAX) return false;
  const sessions = loadV3RegistrationSessions(storage);
  const journals = loadV3RegistrationJournals(storage);
  if (!sessions.ok || !journals.ok) return false;
  const activeSessions = sessions.sessions.filter((session) => activeAt(session, confirmedChainTimestamp));
  const activeJournals = journals.journals.filter((journal) => journalRecoverableAt(journal, confirmedChainTimestamp));
  try {
    if (activeSessions.length === 0) storage.removeItem(V3_REGISTRATION_SESSION_STORAGE_KEY);
    else storage.setItem(V3_REGISTRATION_SESSION_STORAGE_KEY, serializeStorage(activeSessions));
    if (activeJournals.length === 0) storage.removeItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY);
    else storage.setItem(V3_REGISTRATION_JOURNAL_STORAGE_KEY, serializeJournalStorage(activeJournals));
    return true;
  } catch {
    return false;
  }
}

export function exportV3RegistrationJournal(input: unknown) {
  const journal = parseV3RegistrationJournal(input);
  const serialized = JSON.stringify({
    format: "sepbase-v3-registration-journal",
    schemaVersion: V3_REGISTRATION_SESSION_SCHEMA_VERSION,
    journal,
  });
  if (byteLength(serialized) > V3_REGISTRATION_SESSION_EXPORT_MAX_BYTES) {
    throw new Error("Registration journal export exceeds its byte limit.");
  }
  return serialized;
}

export function importV3RegistrationJournal(
  serialized: string,
  expectedScope: V3RegistrationSessionScope,
) {
  const envelope = journalExportEnvelopeSchema.parse(
    parseJsonWithinLimit(serialized, V3_REGISTRATION_SESSION_EXPORT_MAX_BYTES),
  );
  const journal = parseV3RegistrationJournal(envelope.journal);
  const parsedExpectedScope = registrationSessionScopeSchema.parse({
    suiteReleaseId: expectedScope.suiteReleaseId,
    chainId: expectedScope.chainId,
    controller: expectedScope.controller,
    payer: expectedScope.payer,
    commitment: expectedScope.commitment,
    normalizationAttestationHash: expectedScope.normalizationAttestationHash,
  });
  if (v3RegistrationSessionScopeKey(journal) !== v3RegistrationSessionScopeKey(parsedExpectedScope)) {
    throw new Error("Imported registration journal belongs to another exact commitment scope.");
  }
  return journal;
}
