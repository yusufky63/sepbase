import { neonConfig, Pool, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";
import { encryptedEnvelopeSchema } from "./crypto";
import type {
  CasDatabase,
  CasTransaction,
  ChallengeRow,
  OrderBindings,
  OrderRow,
  PreparedPlanRow,
} from "./database";

type PreparedDbRow = {
  quote_id: string;
  plan_id: string;
  payload_hash: string;
  payload_envelope: unknown;
  expires_at: string;
};

type ChallengeDbRow = {
  quote_id: string;
  plan_id: string;
  challenge_hash: string;
  payload_hash: string;
  payload_envelope: unknown;
};

type OrderDbRow = {
  payment_identifier: string;
  request_fingerprint: string;
  payment_payload_hash: string;
  payment_authorization_hash: string;
  plan_id: string;
  quote_id: string;
  reservation_hash: string;
  reservation_envelope: unknown;
  lease_seconds: number;
  status: OrderRow["status"];
  version: string | number;
  refund_disposition: OrderRow["refundDisposition"];
  commit_transaction: `0x${string}` | null;
  reveal_transaction: `0x${string}` | null;
  settlement_transaction: `0x${string}` | null;
  settlement_response_envelope: unknown | null;
  error_code: string | null;
  lease_token_hash: string | null;
  lease_fencing_token: string | number;
  lease_expires_at: Date | string | null;
  updated_at: Date | string;
};

function iso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("PostgreSQL returned an invalid timestamp.");
  return date.toISOString();
}

function safeVersion(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("PostgreSQL returned an invalid CAS version.");
  return parsed;
}

function preparedFromDb(row: PreparedDbRow): PreparedPlanRow {
  return {
    quoteId: row.quote_id,
    planId: row.plan_id,
    payloadHash: row.payload_hash,
    payloadEnvelope: encryptedEnvelopeSchema.parse(row.payload_envelope),
    expiresAt: String(row.expires_at),
  };
}

function challengeFromDb(row: ChallengeDbRow): ChallengeRow {
  return {
    quoteId: row.quote_id,
    planId: row.plan_id,
    challengeHash: row.challenge_hash,
    payloadHash: row.payload_hash,
    payloadEnvelope: encryptedEnvelopeSchema.parse(row.payload_envelope),
  };
}

function orderFromDb(row: OrderDbRow): OrderRow {
  return {
    paymentIdentifier: row.payment_identifier,
    requestFingerprint: row.request_fingerprint,
    paymentPayloadHash: row.payment_payload_hash,
    paymentAuthorizationHash: row.payment_authorization_hash,
    planId: row.plan_id,
    quoteId: row.quote_id,
    status: row.status,
    version: safeVersion(row.version),
    refundDisposition: row.refund_disposition,
    updatedAt: iso(row.updated_at),
    reservationHash: row.reservation_hash,
    reservationEnvelope: encryptedEnvelopeSchema.parse(row.reservation_envelope),
    leaseSeconds: row.lease_seconds,
    leaseTokenHash: row.lease_token_hash,
    leaseFencingToken: String(row.lease_fencing_token),
    leaseExpiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null,
    settlementResponseEnvelope: row.settlement_response_envelope
      ? encryptedEnvelopeSchema.parse(row.settlement_response_envelope)
      : null,
    ...(row.commit_transaction ? { commitTransaction: row.commit_transaction } : {}),
    ...(row.reveal_transaction ? { revealTransaction: row.reveal_transaction } : {}),
    ...(row.settlement_transaction ? { settlementTransaction: row.settlement_transaction } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
  };
}

class NeonCasTransaction implements CasTransaction {
  constructor(private readonly client: PoolClient) {}

  async now() {
    const result = await this.client.query<{ now: Date | string }>("SELECT clock_timestamp() AS now");
    const value = result.rows[0]?.now;
    if (!value) throw new Error("PostgreSQL did not return its transaction clock.");
    return new Date(value);
  }

  async lock(keys: string[]) {
    for (const key of [...new Set(keys)].sort()) {
      await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    }
  }

  async getPreparedExact(quoteId: string, planId: string) {
    const result = await this.client.query<PreparedDbRow>(`
      SELECT quote_id, plan_id, payload_hash, payload_envelope, expires_at::text
      FROM sepbase_x402_prepared_plans
      WHERE quote_id = $1 AND plan_id = $2
      FOR UPDATE
    `, [quoteId, planId]);
    return result.rows[0] ? preparedFromDb(result.rows[0]) : null;
  }

  async getPreparedConflicts(quoteId: string, planId: string) {
    const result = await this.client.query<PreparedDbRow>(`
      SELECT quote_id, plan_id, payload_hash, payload_envelope, expires_at::text
      FROM sepbase_x402_prepared_plans
      WHERE quote_id = $1 OR plan_id = $2
      FOR UPDATE
    `, [quoteId, planId]);
    return result.rows.map(preparedFromDb);
  }

  async insertPrepared(row: PreparedPlanRow) {
    const result = await this.client.query<{ quote_id: string }>(`
      INSERT INTO sepbase_x402_prepared_plans
        (quote_id, plan_id, payload_hash, payload_envelope, expires_at)
      VALUES ($1, $2, $3, $4::jsonb, $5::numeric)
      ON CONFLICT DO NOTHING
      RETURNING quote_id
    `, [row.quoteId, row.planId, row.payloadHash, JSON.stringify(row.payloadEnvelope), row.expiresAt]);
    return result.rowCount === 1;
  }

  async getChallengeExact(quoteId: string, planId: string) {
    const result = await this.client.query<ChallengeDbRow>(`
      SELECT quote_id, plan_id, challenge_hash, payload_hash, payload_envelope
      FROM sepbase_x402_challenges
      WHERE quote_id = $1 AND plan_id = $2
      FOR UPDATE
    `, [quoteId, planId]);
    return result.rows[0] ? challengeFromDb(result.rows[0]) : null;
  }

  async getChallengeConflicts(quoteId: string, planId: string) {
    const result = await this.client.query<ChallengeDbRow>(`
      SELECT quote_id, plan_id, challenge_hash, payload_hash, payload_envelope
      FROM sepbase_x402_challenges
      WHERE quote_id = $1 OR plan_id = $2
      FOR UPDATE
    `, [quoteId, planId]);
    return result.rows.map(challengeFromDb);
  }

  async insertChallenge(row: ChallengeRow) {
    const result = await this.client.query<{ quote_id: string }>(`
      INSERT INTO sepbase_x402_challenges
        (quote_id, plan_id, challenge_hash, payload_hash, payload_envelope)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING quote_id
    `, [
      row.quoteId,
      row.planId,
      row.challengeHash,
      row.payloadHash,
      JSON.stringify(row.payloadEnvelope),
    ]);
    return result.rowCount === 1;
  }

  async getOrderExact(paymentIdentifier: string, planId: string) {
    const result = await this.client.query<OrderDbRow>(`
      SELECT *
      FROM sepbase_x402_registration_orders
      WHERE payment_identifier = $1 AND plan_id = $2
      FOR UPDATE
    `, [paymentIdentifier, planId]);
    return result.rows[0] ? orderFromDb(result.rows[0]) : null;
  }

  async getOrderConflicts(bindings: OrderBindings) {
    const result = await this.client.query<OrderDbRow>(`
      SELECT *
      FROM sepbase_x402_registration_orders
      WHERE payment_identifier = $1
         OR payment_authorization_hash = $2
         OR plan_id = $3
         OR quote_id = $4
      FOR UPDATE
    `, [
      bindings.paymentIdentifier,
      bindings.paymentAuthorizationHash,
      bindings.planId,
      bindings.quoteId,
    ]);
    return result.rows.map(orderFromDb);
  }

  async insertOrder(row: OrderRow) {
    const result = await this.client.query<{ payment_identifier: string }>(`
      INSERT INTO sepbase_x402_registration_orders (
        payment_identifier, request_fingerprint, payment_payload_hash,
        payment_authorization_hash, plan_id, quote_id, reservation_hash,
        reservation_envelope, lease_seconds, status, version, refund_disposition,
        commit_transaction, reveal_transaction, settlement_transaction,
        settlement_response_envelope, error_code, lease_token_hash,
        lease_fencing_token, lease_expires_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12,
        $13, $14, $15, $16::jsonb, $17, $18, $19::numeric, $20::timestamptz, $21::timestamptz
      )
      ON CONFLICT DO NOTHING
      RETURNING payment_identifier
    `, [
      row.paymentIdentifier,
      row.requestFingerprint,
      row.paymentPayloadHash,
      row.paymentAuthorizationHash,
      row.planId,
      row.quoteId,
      row.reservationHash,
      JSON.stringify(row.reservationEnvelope),
      row.leaseSeconds,
      row.status,
      row.version,
      row.refundDisposition,
      row.commitTransaction ?? null,
      row.revealTransaction ?? null,
      row.settlementTransaction ?? null,
      row.settlementResponseEnvelope ? JSON.stringify(row.settlementResponseEnvelope) : null,
      row.errorCode ?? null,
      row.leaseTokenHash,
      row.leaseFencingToken,
      row.leaseExpiresAt,
      row.updatedAt,
    ]);
    return result.rowCount === 1;
  }

  async updateOrder(row: OrderRow, expectedVersion: number) {
    const result = await this.client.query<{ payment_identifier: string }>(`
      UPDATE sepbase_x402_registration_orders
      SET status = $3,
          version = $4,
          refund_disposition = $5,
          commit_transaction = $6,
          reveal_transaction = $7,
          settlement_transaction = $8,
          settlement_response_envelope = $9::jsonb,
          error_code = $10,
          lease_token_hash = $11,
          lease_fencing_token = $12::numeric,
          lease_expires_at = $13::timestamptz,
          updated_at = $14::timestamptz
      WHERE payment_identifier = $1 AND plan_id = $2 AND version = $15
      RETURNING payment_identifier
    `, [
      row.paymentIdentifier,
      row.planId,
      row.status,
      row.version,
      row.refundDisposition,
      row.commitTransaction ?? null,
      row.revealTransaction ?? null,
      row.settlementTransaction ?? null,
      row.settlementResponseEnvelope ? JSON.stringify(row.settlementResponseEnvelope) : null,
      row.errorCode ?? null,
      row.leaseTokenHash,
      row.leaseFencingToken,
      row.leaseExpiresAt,
      row.updatedAt,
      expectedVersion,
    ]);
    return result.rowCount === 1;
  }
}

function postgresErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}

export class NeonCasDatabase implements CasDatabase {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(callback: (transaction: CasTransaction) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await callback(new NeonCasTransaction(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original database error is more useful than a rollback failure.
        }
        if (postgresErrorCode(error) !== "40001" || attempt === 3) throw error;
      } finally {
        client.release();
      }
    }
    throw new Error("PostgreSQL serializable transaction retry exhausted.");
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async close() {
    await this.pool.end();
  }
}

export function createNeonCasDatabase(
  environment: Record<string, string | undefined> = process.env,
) {
  const connectionString = environment.DATABASE_URL?.trim() ?? "";
  if (!/^postgres(?:ql)?:\/\//.test(connectionString)) {
    throw new Error("DATABASE_URL is not configured for the x402 CAS boundary.");
  }
  neonConfig.webSocketConstructor = ws;
  return new NeonCasDatabase(new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  }));
}
