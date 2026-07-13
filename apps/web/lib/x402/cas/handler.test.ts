import { describe, expect, it } from "vitest";
import type { RegistrationReservation } from "../registration";
import { ExternalDurableIdempotencyStore } from "../external-runtime";
import { EncryptedJsonCodec } from "./crypto";
import { MemoryCasDatabase } from "./database";
import { handleCasRequest } from "./handler";
import { casRequestSchema } from "./protocol";
import { EncryptedCasStore } from "./store";

const hash = (character: string) => `sha256:${character.repeat(64)}` as `sha256:${string}`;

describe("x402 CAS protocol", () => {
  it("is wire-compatible with ExternalDurableIdempotencyStore", async () => {
    const server = new EncryptedCasStore(
      new MemoryCasDatabase(() => new Date("2026-07-13T12:00:00.000Z")),
      new EncryptedJsonCodec("test-key", Buffer.alloc(32, 3).toString("base64url")),
      () => "lease_token_0000000000000001",
    );
    const client = new ExternalDurableIdempotencyStore({
      url: "https://sepbase.example/api/internal/x402/store",
      authToken: "test-auth-token-with-safe-length",
      timeoutMs: 2_000,
      fetchImpl: async (_input, init) => {
        const parsed = casRequestSchema.parse(JSON.parse(String(init?.body)));
        return Response.json(await handleCasRequest(server, parsed));
      },
    });
    const reservation = {
      paymentIdentifier: "payment_identifier_001",
      requestFingerprint: hash("1"),
      paymentPayloadHash: hash("2"),
      paymentAuthorizationHash: hash("3"),
      planId: hash("4"),
      quoteId: hash("5"),
      paymentPayload: { x402Version: 2 },
      signedQuote: { signed: true },
      executionPlan: { planId: hash("4") },
      leaseSeconds: 300,
    } as unknown as RegistrationReservation;

    const acquired = await client.reserveOrAcquire(reservation);
    expect(acquired.outcome).toBe("acquired");
    if (acquired.outcome !== "acquired") throw new Error("Expected acquired result");
    await expect(client.loadReservation({
      paymentIdentifier: reservation.paymentIdentifier,
      planId: reservation.planId as `sha256:${string}`,
    })).resolves.toEqual(reservation);
    await expect(client.transition({
      reservation,
      lease: acquired.lease,
      expectedStatuses: ["reserved"],
      patch: { status: "verified", refundDisposition: "not-required-unsettled" },
    })).resolves.toMatchObject({ status: "verified", version: 1 });
  });
});
