import type { EncryptedEnvelope } from "./crypto";
import type {
  DurableRegistrationRecord,
  RegistrationReservation,
} from "../registration";

export type PreparedPlanRow = {
  quoteId: string;
  planId: string;
  payloadHash: string;
  payloadEnvelope: EncryptedEnvelope;
  expiresAt: string;
};

export type ChallengeRow = {
  quoteId: string;
  planId: string;
  challengeHash: string;
  payloadHash: string;
  payloadEnvelope: EncryptedEnvelope;
};

export type OrderRow = Omit<DurableRegistrationRecord, "settlementResponse"> & {
  reservationHash: string;
  reservationEnvelope: EncryptedEnvelope;
  leaseSeconds: number;
  leaseTokenHash: string | null;
  leaseFencingToken: string;
  leaseExpiresAt: string | null;
  settlementResponseEnvelope: EncryptedEnvelope | null;
};

export type OrderBindings = Pick<
  RegistrationReservation,
  "paymentIdentifier" | "paymentAuthorizationHash" | "planId" | "quoteId"
>;

export interface CasTransaction {
  now(): Promise<Date>;
  lock(keys: string[]): Promise<void>;
  getPreparedExact(quoteId: string, planId: string): Promise<PreparedPlanRow | null>;
  getPreparedConflicts(quoteId: string, planId: string): Promise<PreparedPlanRow[]>;
  insertPrepared(row: PreparedPlanRow): Promise<boolean>;
  getChallengeExact(quoteId: string, planId: string): Promise<ChallengeRow | null>;
  getChallengeConflicts(quoteId: string, planId: string): Promise<ChallengeRow[]>;
  insertChallenge(row: ChallengeRow): Promise<boolean>;
  getOrderExact(paymentIdentifier: string, planId: string): Promise<OrderRow | null>;
  getOrderConflicts(bindings: OrderBindings): Promise<OrderRow[]>;
  insertOrder(row: OrderRow): Promise<boolean>;
  updateOrder(row: OrderRow, expectedVersion: number): Promise<boolean>;
}

export interface CasDatabase {
  transaction<T>(callback: (transaction: CasTransaction) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

type MemoryState = {
  prepared: Map<string, PreparedPlanRow>;
  challenges: Map<string, ChallengeRow>;
  orders: Map<string, OrderRow>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function initialState(): MemoryState {
  return {
    prepared: new Map(),
    challenges: new Map(),
    orders: new Map(),
  };
}

function preparedKey(quoteId: string, planId: string) {
  return `${quoteId}:${planId}`;
}

function orderKey(paymentIdentifier: string) {
  return paymentIdentifier;
}

class MemoryTransaction implements CasTransaction {
  constructor(
    private readonly state: MemoryState,
    private readonly clock: () => Date,
  ) {}

  async now() {
    return this.clock();
  }

  async lock(_keys: string[]) {
    // The database serializes all in-memory test transactions.
    void _keys;
  }

  async getPreparedExact(quoteId: string, planId: string) {
    return clone(this.state.prepared.get(preparedKey(quoteId, planId)) ?? null);
  }

  async getPreparedConflicts(quoteId: string, planId: string) {
    return [...this.state.prepared.values()]
      .filter((row) => row.quoteId === quoteId || row.planId === planId)
      .map(clone);
  }

  async insertPrepared(row: PreparedPlanRow) {
    if ((await this.getPreparedConflicts(row.quoteId, row.planId)).length > 0) return false;
    this.state.prepared.set(preparedKey(row.quoteId, row.planId), clone(row));
    return true;
  }

  async getChallengeExact(quoteId: string, planId: string) {
    return clone(this.state.challenges.get(preparedKey(quoteId, planId)) ?? null);
  }

  async getChallengeConflicts(quoteId: string, planId: string) {
    return [...this.state.challenges.values()]
      .filter((row) => row.quoteId === quoteId || row.planId === planId)
      .map(clone);
  }

  async insertChallenge(row: ChallengeRow) {
    if ((await this.getChallengeConflicts(row.quoteId, row.planId)).length > 0) return false;
    this.state.challenges.set(preparedKey(row.quoteId, row.planId), clone(row));
    return true;
  }

  async getOrderExact(paymentIdentifier: string, planId: string) {
    const row = this.state.orders.get(orderKey(paymentIdentifier));
    return row?.planId === planId ? clone(row) : null;
  }

  async getOrderConflicts(bindings: OrderBindings) {
    return [...this.state.orders.values()]
      .filter((row) => row.paymentIdentifier === bindings.paymentIdentifier
        || row.paymentAuthorizationHash === bindings.paymentAuthorizationHash
        || row.planId === bindings.planId
        || row.quoteId === bindings.quoteId)
      .map(clone);
  }

  async insertOrder(row: OrderRow) {
    if ((await this.getOrderConflicts(row)).length > 0) return false;
    this.state.orders.set(orderKey(row.paymentIdentifier), clone(row));
    return true;
  }

  async updateOrder(row: OrderRow, expectedVersion: number) {
    const existing = this.state.orders.get(orderKey(row.paymentIdentifier));
    if (!existing || existing.version !== expectedVersion) return false;
    this.state.orders.set(orderKey(row.paymentIdentifier), clone(row));
    return true;
  }
}

export class MemoryCasDatabase implements CasDatabase {
  #state = initialState();
  #tail: Promise<void> = Promise.resolve();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async transaction<T>(callback: (transaction: CasTransaction) => Promise<T>) {
    const previous = this.#tail;
    let release: () => void = () => undefined;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = clone(this.#state);
    try {
      return await callback(new MemoryTransaction(this.#state, this.clock));
    } catch (error) {
      this.#state = snapshot;
      throw error;
    } finally {
      release();
    }
  }

  async ping() {}

  async close() {}
}
