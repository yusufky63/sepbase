import { z } from "zod";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";

const DAY_SECONDS = 86_400;
const REMINDER_WINDOW_SECONDS = 30 * DAY_SECONDS;
const reminderSchema = z.object({
  schemaVersion: z.literal(1),
  chainId: z.number().int().positive(),
  contract: z.string().nullable(),
  tokenId: z.string().regex(/^\d+$/),
  label: z.string().min(1).max(32),
  fullName: z.string().min(3).max(128),
  expiresAt: z.string().regex(/^\d+$/),
  createdAt: z.number().int().nonnegative(),
  dismissedUntil: z.number().int().nonnegative().optional(),
});

export type RenewalReminder = z.infer<typeof reminderSchema>;

export type RenewalTiming = {
  due: boolean;
  daysRemaining: number;
  label: string;
  urgency: "later" | "month" | "week" | "day" | "expired";
};

export const renewalRemindersChangedEvent = "sepbase:renewal-reminders-changed";
export const renewalReminderStorageKey = [
  "sepbase",
  "renewal-reminders",
  "v1",
  deploymentManifest.chainId,
  protocolAddress ?? "undeployed",
].join(":");

function parseReminderSnapshot(raw: string | null): RenewalReminder[] {
  if (!raw) return [];
  try {
    const parsed = z.array(reminderSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function dispatchChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(renewalRemindersChangedEvent));
}

export function loadRenewalReminders(storage: Storage | null = browserStorage()): RenewalReminder[] {
  if (!storage) return [];
  try {
    return parseReminderSnapshot(storage.getItem(renewalReminderStorageKey));
  } catch {
    return [];
  }
}

export function renewalRemindersSnapshot() {
  const storage = browserStorage();
  if (!storage) return "[]";
  try {
    return storage.getItem(renewalReminderStorageKey) ?? "[]";
  } catch {
    return "[]";
  }
}

export function parseRenewalRemindersSnapshot(snapshot: string) {
  return parseReminderSnapshot(snapshot);
}

export function subscribeRenewalReminders(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === renewalReminderStorageKey) listener();
  };
  window.addEventListener(renewalRemindersChangedEvent, listener);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener(renewalRemindersChangedEvent, listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", listener);
  };
}

function writeRenewalReminders(reminders: RenewalReminder[], storage: Storage | null) {
  if (!storage) return false;
  try {
    storage.setItem(renewalReminderStorageKey, JSON.stringify(reminders));
    dispatchChange();
    return true;
  } catch {
    return false;
  }
}

export function saveRenewalReminder(
  input: Pick<RenewalReminder, "tokenId" | "label" | "fullName" | "expiresAt">,
  options: { storage?: Storage | null; now?: number } = {},
) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const reminders = loadRenewalReminders(storage);
  const existing = reminders.find((item) => item.tokenId === input.tokenId);
  const next: RenewalReminder = {
    schemaVersion: 1,
    chainId: deploymentManifest.chainId,
    contract: protocolAddress,
    ...input,
    createdAt: existing?.createdAt ?? options.now ?? Date.now(),
    ...(existing?.expiresAt === input.expiresAt && existing.dismissedUntil !== undefined
      ? { dismissedUntil: existing.dismissedUntil }
      : {}),
  };
  const updated = [next, ...reminders.filter((item) => item.tokenId !== input.tokenId)];
  return writeRenewalReminders(updated, storage);
}

export function removeRenewalReminder(tokenId: string, storage: Storage | null = browserStorage()) {
  const reminders = loadRenewalReminders(storage);
  return writeRenewalReminders(reminders.filter((item) => item.tokenId !== tokenId), storage);
}

export function dismissRenewalReminder(
  tokenId: string,
  dismissedUntil: number,
  storage: Storage | null = browserStorage(),
) {
  const reminders = loadRenewalReminders(storage).map((item) => (
    item.tokenId === tokenId ? { ...item, dismissedUntil } : item
  ));
  return writeRenewalReminders(reminders, storage);
}

export function isRenewalReminderSaved(tokenId: string, storage: Storage | null = browserStorage()) {
  return loadRenewalReminders(storage).some((item) => item.tokenId === tokenId);
}

export function renewalTiming(expiresAt: bigint | string, nowSeconds: number): RenewalTiming {
  const remaining = Number(BigInt(expiresAt) - BigInt(nowSeconds));
  if (remaining <= 0) {
    return { due: true, daysRemaining: 0, label: "Expiry passed / renew now", urgency: "expired" };
  }
  const daysRemaining = Math.ceil(remaining / DAY_SECONDS);
  if (remaining <= DAY_SECONDS) return { due: true, daysRemaining, label: "Due within 1 day", urgency: "day" };
  if (remaining <= 7 * DAY_SECONDS) return { due: true, daysRemaining, label: `Due in ${daysRemaining} days`, urgency: "week" };
  if (remaining <= REMINDER_WINDOW_SECONDS) {
    return { due: true, daysRemaining, label: `Due in ${daysRemaining} days`, urgency: "month" };
  }
  return { due: false, daysRemaining, label: `Due in ${daysRemaining} days`, urgency: "later" };
}

export function nextDueRenewalReminder(reminders: RenewalReminder[], now = Date.now()) {
  const nowSeconds = Math.floor(now / 1000);
  return reminders
    .filter((item) => (item.dismissedUntil ?? 0) <= now)
    .map((item) => ({ item, timing: renewalTiming(item.expiresAt, nowSeconds) }))
    .filter(({ timing }) => timing.due)
    .sort((left, right) => Number(BigInt(left.item.expiresAt) - BigInt(right.item.expiresAt)))[0] ?? null;
}

function icsDate(seconds: bigint) {
  return new Date(Number(seconds) * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildRenewalCalendar(
  reminder: Pick<RenewalReminder, "tokenId" | "label" | "fullName" | "expiresAt">,
  options: { now?: number; siteUrl?: string } = {},
) {
  const expiresAt = BigInt(reminder.expiresAt);
  const siteUrl = (options.siteUrl ?? projectConfig.siteUrl).replace(/\/$/, "");
  const nameUrl = `${siteUrl}/name/${encodeURIComponent(reminder.label)}`;
  const start = icsDate(expiresAt);
  const end = icsDate(expiresAt + 1_800n);
  const stamp = new Date(options.now ?? Date.now()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const alarms = [30, 7, 1].flatMap((days) => [
    "BEGIN:VALARM",
    `TRIGGER:-P${days}D`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(`Renew ${reminder.fullName}`)}`,
    "END:VALARM",
  ]);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SEPBASE//Renewal Watch//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${reminder.tokenId}-${deploymentManifest.chainId}@sepbase`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcs(`Renew ${reminder.fullName}`)}`,
    `DESCRIPTION:${escapeIcs(`Renewal date for ${reminder.fullName} on ${deploymentManifest.chainName}.`)}`,
    `URL:${nameUrl}`,
    ...alarms,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
