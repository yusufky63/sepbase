import { describe, expect, it } from "vitest";
import type {
  PersistedX402Challenge,
  PreparedRegistrationPlan,
  RegistrationReservation,
} from "../registration";
import { EncryptedJsonCodec } from "./crypto";
import { MemoryCasDatabase } from "./database";
import { EncryptedCasStore } from "./store";

const hash = (character: string) => `sha256:${character.repeat(64)}` as `sha256:${string}`;
const transaction = (character: string) => `0x${character.repeat(64)}` as `0x${string}`;

function reservation(overrides: Partial<RegistrationReservation> = {}) {
  return {
    paymentIdentifier: "payment_identifier_001",
    requestFingerprint: hash("1"),
    paymentPayloadHash: hash("2"),
    paymentAuthorizationHash: hash("3"),
    planId: hash("4"),
    quoteId: hash("5"),
    paymentPayload: {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "eip155:84532",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: "500",
        payTo: "0xEAa823AB4C4eE00283d8ed7be713ddf8A5ba0Fac",
        maxTimeoutSeconds: 300,
        extra: {},
      },
      payload: { authorization: { nonce: "secret" }, signature: "0xsigned" },
      resource: { url: "https://sepbase.vercel.app/api/x402/registration", description: "register" },
      extensions: {},
    },
    signedQuote: { payload: "signed" },
    executionPlan: { planId: hash("4"), secret: "encrypted-plan" },
    leaseSeconds: 300,
    ...overrides,
  } as unknown as RegistrationReservation;
}

function prepared(overrides: Partial<PreparedRegistrationPlan> = {}) {
  return {
    quoteId: hash("5"),
    planId: hash("4"),
    signedQuote: { payload: "signed" },
    executionPlan: { planId: hash("4") },
    expiresAt: "1785000000",
    ...overrides,
  } as PreparedRegistrationPlan;
}

function challenge(overrides: Partial<PersistedX402Challenge> = {}) {
  return {
    quoteId: hash("5"),
    planId: hash("4"),
    challengeHash: hash("6"),
    challenge: {
      paymentRequired: { x402Version: 2 },
      requirement: { scheme: "exact" },
      paymentRequiredHeader: "encoded-payment-required",
      declaredExtensions: {},
    },
    ...overrides,
  } as PersistedX402Challenge;
}

function store(clock: () => Date) {
  return new EncryptedCasStore(
    new MemoryCasDatabase(clock),
    new EncryptedJsonCodec("test-key", Buffer.alloc(32, 9).toString("base64url")),
    (() => {
      let sequence = 0;
      return () => `lease_token_${String(++sequence).padStart(16, "0")}`;
    })(),
  );
}

describe("EncryptedCasStore", () => {
  it("persists prepared plans and deterministic challenges exactly once", async () => {
    const runtime = store(() => new Date("2026-07-13T12:00:00.000Z"));
    await expect(runtime.persistPreparedPlan(prepared())).resolves.toMatchObject({ outcome: "stored" });
    await expect(runtime.persistPreparedPlan(prepared())).resolves.toMatchObject({ outcome: "existing" });
    await expect(runtime.persistPreparedPlan(prepared({ planId: hash("7") })))
      .resolves.toEqual({ outcome: "conflict" });
    await expect(runtime.loadPreparedPlan({ quoteId: hash("5"), planId: hash("4") }))
      .resolves.toEqual(prepared());

    await expect(runtime.persistChallenge(challenge())).resolves.toMatchObject({ outcome: "stored" });
    await expect(runtime.persistChallenge(challenge())).resolves.toMatchObject({ outcome: "existing" });
    await expect(runtime.persistChallenge(challenge({ challengeHash: hash("8") })))
      .resolves.toEqual({ outcome: "conflict" });
  });

  it("enforces global authorization uniqueness and active-lease idempotency", async () => {
    const runtime = store(() => new Date("2026-07-13T12:00:00.000Z"));
    const first = await runtime.reserveOrAcquire(reservation());
    expect(first.outcome).toBe("acquired");
    await expect(runtime.reserveOrAcquire(reservation())).resolves.toMatchObject({
      outcome: "existing",
      record: { status: "reserved", version: 0 },
    });
    await expect(runtime.reserveOrAcquire(reservation({
      paymentIdentifier: "payment_identifier_002",
      planId: hash("7"),
      quoteId: hash("8"),
    }))).resolves.toEqual({ outcome: "conflict" });
  });

  it("fences stale workers and atomically advances the registration state", async () => {
    let now = new Date("2026-07-13T12:00:00.000Z");
    const runtime = store(() => now);
    const initial = await runtime.reserveOrAcquire(reservation());
    if (initial.outcome !== "acquired") throw new Error("Expected initial lease");
    await runtime.release({ reservation: reservation(), lease: initial.lease });

    const second = await runtime.reserveOrAcquire(reservation());
    if (second.outcome !== "acquired") throw new Error("Expected reacquired lease");
    expect(BigInt(second.lease.fencingToken)).toBeGreaterThan(BigInt(initial.lease.fencingToken));
    await expect(runtime.release({ reservation: reservation(), lease: initial.lease }))
      .rejects.toMatchObject({ code: "CAS_STALE_LEASE" });

    const verified = await runtime.transition({
      reservation: reservation(),
      lease: second.lease,
      expectedStatuses: ["reserved"],
      patch: { status: "verified", refundDisposition: "not-required-unsettled" },
    });
    expect(verified).toMatchObject({ status: "verified", version: 1 });
    await expect(runtime.transition({
      reservation: reservation(),
      lease: second.lease,
      expectedStatuses: ["reserved"],
      patch: { status: "verified" },
    })).rejects.toMatchObject({ code: "CAS_STATUS_CONFLICT" });

    const renewed = await runtime.renew({ reservation: reservation(), lease: second.lease });
    expect(renewed.token).toBe(second.lease.token);
    now = new Date("2026-07-13T13:00:00.000Z");
    await expect(runtime.transition({
      reservation: reservation(),
      lease: renewed,
      expectedStatuses: ["verified"],
      patch: { status: "commit-submitted", commitTransaction: transaction("a") },
    })).rejects.toMatchObject({ code: "CAS_STALE_LEASE" });
  });
});
