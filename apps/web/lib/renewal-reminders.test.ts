import { beforeEach, describe, expect, it } from "vitest";
import {
  buildRenewalCalendar,
  dismissRenewalReminder,
  loadRenewalReminders,
  nextDueRenewalReminder,
  renewalTiming,
  saveRenewalReminder,
} from "./renewal-reminders";

const reminder = {
  tokenId: "1",
  label: "alice",
  fullName: "alice.sepbase",
  expiresAt: String(2_000_000_000),
} as const;

describe("renewal reminders", () => {
  beforeEach(() => localStorage.clear());

  it("stores a scoped reminder and resets dismissal when expiry changes", () => {
    expect(saveRenewalReminder(reminder, { storage: localStorage, now: 100 })).toBe(true);
    dismissRenewalReminder("1", 500, localStorage);
    saveRenewalReminder({ ...reminder, expiresAt: String(2_100_000_000) }, { storage: localStorage, now: 200 });

    expect(loadRenewalReminders(localStorage)).toEqual([
      expect.objectContaining({ tokenId: "1", expiresAt: "2100000000", createdAt: 100 }),
    ]);
    expect(loadRenewalReminders(localStorage)[0]?.dismissedUntil).toBeUndefined();
  });

  it("selects only due and non-dismissed reminders", () => {
    const nowSeconds = 1_999_000_000;
    const timing = renewalTiming(reminder.expiresAt, nowSeconds);
    expect(timing).toMatchObject({ due: true, urgency: "month" });

    saveRenewalReminder(reminder, { storage: localStorage, now: nowSeconds * 1000 });
    expect(nextDueRenewalReminder(loadRenewalReminders(localStorage), nowSeconds * 1000)?.item.fullName)
      .toBe("alice.sepbase");
    dismissRenewalReminder("1", (nowSeconds + 60) * 1000, localStorage);
    expect(nextDueRenewalReminder(loadRenewalReminders(localStorage), nowSeconds * 1000)).toBeNull();
  });

  it("builds a portable calendar event with 30, 7, and 1 day alarms", () => {
    const calendar = buildRenewalCalendar(reminder, {
      now: 1_900_000_000_000,
      siteUrl: "https://names.example",
    });

    expect(calendar).toContain("BEGIN:VCALENDAR");
    expect(calendar).toContain("TRIGGER:-P30D");
    expect(calendar).toContain("TRIGGER:-P7D");
    expect(calendar).toContain("TRIGGER:-P1D");
    expect(calendar).toContain("URL:https://names.example/name/alice");
  });
});
