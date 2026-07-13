import type { SettleResponse } from "@x402/core/types";
import type {
  DurableRegistrationRecord,
  PersistedX402Challenge,
  PreparedRegistrationPlan,
  RegistrationJobStatus,
  RegistrationLease,
  RegistrationRecordPatch,
  RegistrationReservation,
} from "../registration";
import {
  canonicalSha256,
  createLeaseToken,
  EncryptedJsonCodec,
  secretTokenHash,
} from "./crypto";
import type {
  CasDatabase,
  CasTransaction,
  ChallengeRow,
  OrderRow,
  PreparedPlanRow,
} from "./database";
import {
  persistedChallengeSchema,
  preparedPlanSchema,
  reservationSchema,
} from "./protocol";

export class CasStoreError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CasStoreError";
  }
}

type ReservationBinding = Omit<
  RegistrationReservation,
  "paymentPayload" | "signedQuote" | "executionPlan"
>;

const terminalStatuses = new Set<RegistrationJobStatus>(["settled", "terminal-failure"]);
const allowedTransitions: Record<RegistrationJobStatus, ReadonlySet<RegistrationJobStatus>> = {
  reserved: new Set(["verified"]),
  verified: new Set(["commit-submitted"]),
  "commit-submitted": new Set(["reveal-ready", "terminal-failure"]),
  "reveal-ready": new Set(["reveal-submitted"]),
  "reveal-submitted": new Set(["confirmed", "terminal-failure"]),
  confirmed: new Set(["reconciliation-required", "settled"]),
  "reconciliation-required": new Set(["reconciliation-required", "settled"]),
  settled: new Set(["settled"]),
  "terminal-failure": new Set(["terminal-failure"]),
};

function preparedContext(quoteId: string, planId: string) {
  return { entity: "prepared-plan" as const, primaryId: quoteId, secondaryId: planId };
}

function challengeContext(quoteId: string, planId: string) {
  return { entity: "challenge" as const, primaryId: quoteId, secondaryId: planId };
}

function reservationContext(paymentIdentifier: string, planId: string) {
  return { entity: "reservation" as const, primaryId: paymentIdentifier, secondaryId: planId };
}

function settlementContext(paymentIdentifier: string, planId: string) {
  return { entity: "settlement-response" as const, primaryId: paymentIdentifier, secondaryId: planId };
}

function bindingLocks(reservation: ReservationBinding) {
  return [
    `authorization:${reservation.paymentAuthorizationHash}`,
    `payment:${reservation.paymentIdentifier}`,
    `plan:${reservation.planId}`,
    `quote:${reservation.quoteId}`,
  ];
}

function assertRecordBinding(row: OrderRow, reservation: ReservationBinding) {
  if (
    row.paymentIdentifier !== reservation.paymentIdentifier
    || row.requestFingerprint !== reservation.requestFingerprint
    || row.paymentPayloadHash !== reservation.paymentPayloadHash
    || row.paymentAuthorizationHash !== reservation.paymentAuthorizationHash
    || row.planId !== reservation.planId
    || row.quoteId !== reservation.quoteId
    || row.leaseSeconds !== reservation.leaseSeconds
  ) {
    throw new CasStoreError(409, "CAS_BINDING_CONFLICT", "The x402 order binding conflicts with an existing record.");
  }
}

function assertLease(
  row: OrderRow,
  lease: RegistrationLease,
  now: Date,
  requireUnexpired: boolean,
) {
  if (
    !row.leaseTokenHash
    || !row.leaseExpiresAt
    || secretTokenHash(lease.token) !== row.leaseTokenHash
    || lease.fencingToken !== row.leaseFencingToken
    || lease.expiresAt !== row.leaseExpiresAt
    || (requireUnexpired && new Date(row.leaseExpiresAt).getTime() <= now.getTime())
  ) {
    throw new CasStoreError(409, "CAS_STALE_LEASE", "The x402 fencing lease is stale or invalid.");
  }
}

function assertTransition(row: OrderRow, patch: RegistrationRecordPatch) {
  if (!patch.status || !allowedTransitions[row.status].has(patch.status)) {
    throw new CasStoreError(409, "CAS_INVALID_TRANSITION", "The requested x402 state transition is not allowed.");
  }
  const nextStatus = patch.status;
  const commitTransaction = patch.commitTransaction ?? row.commitTransaction;
  const revealTransaction = patch.revealTransaction ?? row.revealTransaction;
  const settlementTransaction = patch.settlementTransaction ?? row.settlementTransaction;
  const errorCode = patch.errorCode ?? row.errorCode;

  if (nextStatus === "commit-submitted" && !commitTransaction) {
    throw new CasStoreError(409, "CAS_INCOMPLETE_TRANSITION", "A submitted commit requires its transaction hash.");
  }
  if (["reveal-submitted", "confirmed", "reconciliation-required", "settled"].includes(nextStatus)
    && !revealTransaction) {
    throw new CasStoreError(409, "CAS_INCOMPLETE_TRANSITION", "The x402 state requires its reveal transaction hash.");
  }
  if (nextStatus === "terminal-failure" && !errorCode) {
    throw new CasStoreError(409, "CAS_INCOMPLETE_TRANSITION", "A terminal failure requires an error code.");
  }
  if (nextStatus === "reconciliation-required" && patch.refundDisposition !== "manual-review") {
    throw new CasStoreError(409, "CAS_INCOMPLETE_TRANSITION", "Reconciliation requires manual-review disposition.");
  }
  if (nextStatus === "settled" && (
    !settlementTransaction
    || !patch.settlementResponse
    || patch.refundDisposition !== "not-applicable-registered"
  )) {
    throw new CasStoreError(409, "CAS_INCOMPLETE_TRANSITION", "A settled order requires its settlement proof.");
  }
}

function withoutSettlementEnvelope(row: OrderRow) {
  const {
    reservationHash: _reservationHash,
    reservationEnvelope: _reservationEnvelope,
    leaseSeconds: _leaseSeconds,
    leaseTokenHash: _leaseTokenHash,
    leaseFencingToken: _leaseFencingToken,
    leaseExpiresAt: _leaseExpiresAt,
    settlementResponseEnvelope: _settlementResponseEnvelope,
    ...record
  } = row;
  void _reservationHash;
  void _reservationEnvelope;
  void _leaseSeconds;
  void _leaseTokenHash;
  void _leaseFencingToken;
  void _leaseExpiresAt;
  void _settlementResponseEnvelope;
  return record;
}

export class EncryptedCasStore {
  constructor(
    private readonly database: CasDatabase,
    private readonly codec: EncryptedJsonCodec,
    private readonly newLeaseToken: () => string = createLeaseToken,
  ) {}

  private preparedFromRow(row: PreparedPlanRow) {
    const value = preparedPlanSchema.parse(this.codec.decrypt(
      row.payloadEnvelope,
      preparedContext(row.quoteId, row.planId),
    )) as PreparedRegistrationPlan;
    if (canonicalSha256(value) !== row.payloadHash) {
      throw new CasStoreError(503, "CAS_INTEGRITY_FAILURE", "The encrypted prepared plan failed integrity verification.");
    }
    return value;
  }

  private challengeFromRow(row: ChallengeRow) {
    const value = persistedChallengeSchema.parse(this.codec.decrypt(
      row.payloadEnvelope,
      challengeContext(row.quoteId, row.planId),
    )) as PersistedX402Challenge;
    if (canonicalSha256(value) !== row.payloadHash || value.challengeHash !== row.challengeHash) {
      throw new CasStoreError(503, "CAS_INTEGRITY_FAILURE", "The encrypted x402 challenge failed integrity verification.");
    }
    return value;
  }

  private reservationFromRow(row: OrderRow) {
    const value = reservationSchema.parse(this.codec.decrypt(
      row.reservationEnvelope,
      reservationContext(row.paymentIdentifier, row.planId),
    )) as RegistrationReservation;
    if (canonicalSha256(value) !== row.reservationHash) {
      throw new CasStoreError(503, "CAS_INTEGRITY_FAILURE", "The encrypted x402 reservation failed integrity verification.");
    }
    assertRecordBinding(row, value);
    return value;
  }

  private recordFromRow(row: OrderRow): DurableRegistrationRecord {
    const record = withoutSettlementEnvelope(row);
    if (!row.settlementResponseEnvelope) return record;
    const settlementResponse = this.codec.decrypt(
      row.settlementResponseEnvelope,
      settlementContext(row.paymentIdentifier, row.planId),
    ) as SettleResponse;
    return { ...record, settlementResponse };
  }

  async loadPreparedPlan(options: { quoteId: string; planId: string }) {
    return this.database.transaction(async (transaction) => {
      const row = await transaction.getPreparedExact(options.quoteId, options.planId);
      return row ? this.preparedFromRow(row) : null;
    });
  }

  async persistPreparedPlan(prepared: PreparedRegistrationPlan) {
    const payloadHash = canonicalSha256(prepared);
    return this.database.transaction(async (transaction) => {
      await transaction.lock([`prepared-plan:${prepared.planId}`, `prepared-quote:${prepared.quoteId}`]);
      const conflicts = await transaction.getPreparedConflicts(prepared.quoteId, prepared.planId);
      if (conflicts.length > 0) {
        if (conflicts.length !== 1) return { outcome: "conflict" as const };
        const existing = conflicts[0]!;
        if (
          existing.quoteId !== prepared.quoteId
          || existing.planId !== prepared.planId
          || existing.payloadHash !== payloadHash
        ) return { outcome: "conflict" as const };
        return { outcome: "existing" as const, prepared: this.preparedFromRow(existing) };
      }
      const row: PreparedPlanRow = {
        quoteId: prepared.quoteId,
        planId: prepared.planId,
        payloadHash,
        payloadEnvelope: this.codec.encrypt(prepared, preparedContext(prepared.quoteId, prepared.planId)),
        expiresAt: prepared.expiresAt,
      };
      if (!await transaction.insertPrepared(row)) return { outcome: "conflict" as const };
      return { outcome: "stored" as const, prepared };
    });
  }

  async loadChallenge(options: { quoteId: string; planId: string }) {
    return this.database.transaction(async (transaction) => {
      const row = await transaction.getChallengeExact(options.quoteId, options.planId);
      return row ? this.challengeFromRow(row) : null;
    });
  }

  async persistChallenge(persisted: PersistedX402Challenge) {
    const payloadHash = canonicalSha256(persisted);
    return this.database.transaction(async (transaction) => {
      await transaction.lock([`challenge-plan:${persisted.planId}`, `challenge-quote:${persisted.quoteId}`]);
      const conflicts = await transaction.getChallengeConflicts(persisted.quoteId, persisted.planId);
      if (conflicts.length > 0) {
        if (conflicts.length !== 1) return { outcome: "conflict" as const };
        const existing = conflicts[0]!;
        if (
          existing.quoteId !== persisted.quoteId
          || existing.planId !== persisted.planId
          || existing.challengeHash !== persisted.challengeHash
          || existing.payloadHash !== payloadHash
        ) return { outcome: "conflict" as const };
        return { outcome: "existing" as const, persisted: this.challengeFromRow(existing) };
      }
      const row: ChallengeRow = {
        quoteId: persisted.quoteId,
        planId: persisted.planId,
        challengeHash: persisted.challengeHash,
        payloadHash,
        payloadEnvelope: this.codec.encrypt(
          persisted,
          challengeContext(persisted.quoteId, persisted.planId),
        ),
      };
      if (!await transaction.insertChallenge(row)) return { outcome: "conflict" as const };
      return { outcome: "stored" as const, persisted };
    });
  }

  async loadReservation(options: { paymentIdentifier: string; planId: string }) {
    return this.database.transaction(async (transaction) => {
      const row = await transaction.getOrderExact(options.paymentIdentifier, options.planId);
      return row ? this.reservationFromRow(row) : null;
    });
  }

  async loadRecord(options: { paymentIdentifier: string; planId: string }) {
    return this.database.transaction(async (transaction) => {
      const row = await transaction.getOrderExact(options.paymentIdentifier, options.planId);
      return row ? this.recordFromRow(row) : null;
    });
  }

  private leaseFor(row: OrderRow, token: string): RegistrationLease {
    if (!row.leaseExpiresAt) {
      throw new CasStoreError(503, "CAS_INTEGRITY_FAILURE", "The acquired x402 order has no lease expiry.");
    }
    return { token, fencingToken: row.leaseFencingToken, expiresAt: row.leaseExpiresAt };
  }

  private async acquireLease(
    transaction: CasTransaction,
    row: OrderRow,
    now: Date,
    expectedVersion: number,
  ) {
    const token = this.newLeaseToken();
    const next: OrderRow = {
      ...row,
      leaseTokenHash: secretTokenHash(token),
      leaseFencingToken: (BigInt(row.leaseFencingToken) + 1n).toString(),
      leaseExpiresAt: new Date(now.getTime() + row.leaseSeconds * 1_000).toISOString(),
    };
    if (!await transaction.updateOrder(next, expectedVersion)) {
      throw new CasStoreError(409, "CAS_WRITE_CONFLICT", "The x402 order changed during lease acquisition.");
    }
    return { row: next, lease: this.leaseFor(next, token) };
  }

  async reserveOrAcquire(reservation: RegistrationReservation) {
    const reservationHash = canonicalSha256(reservation);
    return this.database.transaction(async (transaction) => {
      await transaction.lock(bindingLocks(reservation));
      const conflicts = await transaction.getOrderConflicts(reservation);
      const now = await transaction.now();
      if (conflicts.length === 0) {
        const token = this.newLeaseToken();
        const row: OrderRow = {
          paymentIdentifier: reservation.paymentIdentifier,
          requestFingerprint: reservation.requestFingerprint,
          paymentPayloadHash: reservation.paymentPayloadHash,
          paymentAuthorizationHash: reservation.paymentAuthorizationHash,
          planId: reservation.planId,
          status: "reserved",
          quoteId: reservation.quoteId,
          version: 0,
          refundDisposition: "not-required-unsettled",
          updatedAt: now.toISOString(),
          reservationHash,
          reservationEnvelope: this.codec.encrypt(
            reservation,
            reservationContext(reservation.paymentIdentifier, reservation.planId),
          ),
          leaseSeconds: reservation.leaseSeconds,
          leaseTokenHash: secretTokenHash(token),
          leaseFencingToken: "1",
          leaseExpiresAt: new Date(now.getTime() + reservation.leaseSeconds * 1_000).toISOString(),
          settlementResponseEnvelope: null,
        };
        if (!await transaction.insertOrder(row)) return { outcome: "conflict" as const };
        return {
          outcome: "acquired" as const,
          record: this.recordFromRow(row),
          lease: this.leaseFor(row, token),
        };
      }
      if (conflicts.length !== 1) return { outcome: "conflict" as const };
      const row = conflicts[0]!;
      try {
        assertRecordBinding(row, reservation);
      } catch {
        return { outcome: "conflict" as const };
      }
      if (row.reservationHash !== reservationHash) return { outcome: "conflict" as const };
      this.reservationFromRow(row);
      if (terminalStatuses.has(row.status)) {
        return { outcome: "existing" as const, record: this.recordFromRow(row) };
      }
      if (row.leaseExpiresAt && new Date(row.leaseExpiresAt).getTime() > now.getTime()) {
        return { outcome: "existing" as const, record: this.recordFromRow(row) };
      }
      const acquired = await this.acquireLease(transaction, row, now, row.version);
      return {
        outcome: "acquired" as const,
        record: this.recordFromRow(acquired.row),
        lease: acquired.lease,
      };
    });
  }

  async transition(options: {
    reservation: ReservationBinding;
    lease: RegistrationLease;
    expectedStatuses: RegistrationJobStatus[];
    patch: RegistrationRecordPatch;
  }) {
    return this.database.transaction(async (transaction) => {
      await transaction.lock(bindingLocks(options.reservation));
      const row = await transaction.getOrderExact(
        options.reservation.paymentIdentifier,
        options.reservation.planId,
      );
      if (!row) throw new CasStoreError(404, "CAS_ORDER_NOT_FOUND", "The x402 order does not exist.");
      assertRecordBinding(row, options.reservation);
      const now = await transaction.now();
      assertLease(row, options.lease, now, true);
      if (!options.expectedStatuses.includes(row.status)) {
        throw new CasStoreError(409, "CAS_STATUS_CONFLICT", "The x402 order is no longer in an expected state.");
      }
      assertTransition(row, options.patch);
      const next: OrderRow = {
        ...row,
        ...options.patch,
        version: row.version + 1,
        updatedAt: now.toISOString(),
        settlementResponseEnvelope: options.patch.settlementResponse
          ? this.codec.encrypt(
            options.patch.settlementResponse,
            settlementContext(row.paymentIdentifier, row.planId),
          )
          : row.settlementResponseEnvelope,
      };
      delete (next as Partial<DurableRegistrationRecord>).settlementResponse;
      if (!await transaction.updateOrder(next, row.version)) {
        throw new CasStoreError(409, "CAS_WRITE_CONFLICT", "The x402 order changed during transition.");
      }
      return this.recordFromRow(next);
    });
  }

  async renew(options: { reservation: ReservationBinding; lease: RegistrationLease }) {
    return this.database.transaction(async (transaction) => {
      await transaction.lock(bindingLocks(options.reservation));
      const row = await transaction.getOrderExact(
        options.reservation.paymentIdentifier,
        options.reservation.planId,
      );
      if (!row) throw new CasStoreError(404, "CAS_ORDER_NOT_FOUND", "The x402 order does not exist.");
      assertRecordBinding(row, options.reservation);
      const now = await transaction.now();
      assertLease(row, options.lease, now, true);
      if (terminalStatuses.has(row.status)) {
        throw new CasStoreError(409, "CAS_TERMINAL_ORDER", "A terminal x402 order cannot renew its lease.");
      }
      const expiresAt = new Date(now.getTime() + row.leaseSeconds * 1_000).toISOString();
      const next: OrderRow = {
        ...row,
        leaseExpiresAt: expiresAt,
      };
      if (!await transaction.updateOrder(next, row.version)) {
        throw new CasStoreError(409, "CAS_WRITE_CONFLICT", "The x402 order changed during lease renewal.");
      }
      return {
        token: options.lease.token,
        fencingToken: next.leaseFencingToken,
        expiresAt,
      } satisfies RegistrationLease;
    });
  }

  async release(options: { reservation: ReservationBinding; lease: RegistrationLease }) {
    return this.database.transaction(async (transaction) => {
      await transaction.lock(bindingLocks(options.reservation));
      const row = await transaction.getOrderExact(
        options.reservation.paymentIdentifier,
        options.reservation.planId,
      );
      if (!row) throw new CasStoreError(404, "CAS_ORDER_NOT_FOUND", "The x402 order does not exist.");
      assertRecordBinding(row, options.reservation);
      if (!row.leaseTokenHash && !row.leaseExpiresAt) return;
      assertLease(row, options.lease, await transaction.now(), false);
      const next: OrderRow = {
        ...row,
        leaseTokenHash: null,
        leaseExpiresAt: null,
      };
      if (!await transaction.updateOrder(next, row.version)) {
        throw new CasStoreError(409, "CAS_WRITE_CONFLICT", "The x402 order changed during lease release.");
      }
    });
  }
}
