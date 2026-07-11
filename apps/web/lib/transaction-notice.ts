import { deploymentManifest } from "./deployment-manifest";

export type TransactionNoticeKind = "listed" | "listing-updated" | "listing-removed" | "purchased";

export type TransactionNotice = {
  kind: TransactionNoticeKind;
  message: string;
  name: string;
  title: string;
};

type StoredNotice = {
  createdAt: number;
  kind: TransactionNoticeKind;
  name: string;
};

type StorageOptions = {
  now?: number;
  storage?: Storage | null;
};

const noticeLifetimeMs = 10 * 60 * 1_000;
const scope = `${deploymentManifest.schemaVersion}:${deploymentManifest.chainId}:${deploymentManifest.contract?.toLowerCase() ?? "pending"}`;
export const transactionNoticeStorageKey = `chain-name:transaction-notice:v1:${scope}`;

const noticeCopy: Record<TransactionNoticeKind, (name: string) => Omit<TransactionNotice, "kind" | "name">> = {
  listed: (name) => ({ title: "Listing is live", message: `${name} is now visible in the market.` }),
  "listing-updated": (name) => ({ title: "Listing updated", message: `The new price for ${name} is now live.` }),
  "listing-removed": (name) => ({ title: "Listing removed", message: `${name} is no longer listed.` }),
  purchased: (name) => ({ title: "Purchase complete", message: `${name} has been added to your names.` }),
};

function resolveStorage(options: StorageOptions) {
  if ("storage" in options) return options.storage ?? null;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function validFullName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const suffix = `.${deploymentManifest.suffix}`;
  return value === value.trim()
    && value.endsWith(suffix)
    && value.length > suffix.length
    && value.length <= deploymentManifest.nameRules.maxLength + suffix.length;
}

export function createTransactionNotice(kind: unknown, name: unknown): TransactionNotice | null {
  if (typeof kind !== "string" || !(kind in noticeCopy) || !validFullName(name)) return null;
  const typedKind = kind as TransactionNoticeKind;
  return { kind: typedKind, name, ...noticeCopy[typedKind](name) };
}

export function queueTransactionNotice(
  kind: TransactionNoticeKind,
  name: string,
  options: StorageOptions = {},
) {
  const notice = createTransactionNotice(kind, name);
  const storage = resolveStorage(options);
  if (!notice || !storage) return;
  const payload: StoredNotice = {
    createdAt: options.now ?? Date.now(),
    kind: notice.kind,
    name: notice.name,
  };
  try {
    storage.setItem(transactionNoticeStorageKey, JSON.stringify(payload));
  } catch {
    // Navigation still succeeds when browser storage is unavailable.
  }
}

export function consumeTransactionNotice(options: StorageOptions = {}): TransactionNotice | null {
  const storage = resolveStorage(options);
  if (!storage) return null;
  try {
    const raw = storage.getItem(transactionNoticeStorageKey);
    storage.removeItem(transactionNoticeStorageKey);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<StoredNotice>;
    const now = options.now ?? Date.now();
    if (
      typeof payload.createdAt !== "number"
      || !Number.isFinite(payload.createdAt)
      || payload.createdAt > now + 5_000
      || now - payload.createdAt > noticeLifetimeMs
    ) return null;
    return createTransactionNotice(payload.kind, payload.name);
  } catch {
    return null;
  }
}
