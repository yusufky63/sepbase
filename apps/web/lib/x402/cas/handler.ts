import type {
  PersistedX402Challenge,
  PreparedRegistrationPlan,
  RegistrationJobStatus,
  RegistrationLease,
  RegistrationRecordPatch,
  RegistrationReservation,
} from "../registration";
import { CAS_CAPABILITIES, CAS_SCHEMA, type CasRequest } from "./protocol";
import { EncryptedCasStore } from "./store";

export async function handleCasRequest(store: EncryptedCasStore, request: CasRequest) {
  switch (request.operation) {
    case "load-registration-plan": {
      const reservation = await store.loadReservation(request);
      return reservation
        ? { schema: CAS_SCHEMA, outcome: "found" as const, capabilities: CAS_CAPABILITIES, reservation }
        : { schema: CAS_SCHEMA, outcome: "missing" as const, capabilities: CAS_CAPABILITIES };
    }
    case "load-registration-record": {
      const record = await store.loadRecord(request);
      return record
        ? { schema: CAS_SCHEMA, outcome: "found" as const, capabilities: CAS_CAPABILITIES, record }
        : { schema: CAS_SCHEMA, outcome: "missing" as const, capabilities: CAS_CAPABILITIES };
    }
    case "load-prepared-registration-plan": {
      const prepared = await store.loadPreparedPlan(request);
      return prepared
        ? { schema: CAS_SCHEMA, outcome: "found" as const, capabilities: CAS_CAPABILITIES, prepared }
        : { schema: CAS_SCHEMA, outcome: "missing" as const, capabilities: CAS_CAPABILITIES };
    }
    case "persist-prepared-registration-plan": {
      const result = await store.persistPreparedPlan(request.prepared as PreparedRegistrationPlan);
      return { schema: CAS_SCHEMA, ...result };
    }
    case "reserve-or-acquire-plan": {
      const result = await store.reserveOrAcquire(request.reservation as RegistrationReservation);
      return { schema: CAS_SCHEMA, capabilities: CAS_CAPABILITIES, ...result };
    }
    case "compare-and-set-plan": {
      const record = await store.transition({
        reservation: request.reservation,
        lease: request.lease as RegistrationLease,
        expectedStatuses: request.expectedStatuses as RegistrationJobStatus[],
        patch: request.patch as RegistrationRecordPatch,
      });
      return { schema: CAS_SCHEMA, outcome: "updated" as const, record };
    }
    case "renew-plan-lease": {
      const lease = await store.renew({
        reservation: request.reservation,
        lease: request.lease as RegistrationLease,
      });
      return { schema: CAS_SCHEMA, outcome: "renewed" as const, lease };
    }
    case "release-plan-lease": {
      await store.release({
        reservation: request.reservation,
        lease: request.lease as RegistrationLease,
      });
      return { schema: CAS_SCHEMA, outcome: "released" as const };
    }
    case "load-registration-challenge": {
      const persisted = await store.loadChallenge(request);
      return persisted
        ? { schema: CAS_SCHEMA, outcome: "found" as const, persisted }
        : { schema: CAS_SCHEMA, outcome: "missing" as const };
    }
    case "persist-registration-challenge": {
      const result = await store.persistChallenge(request.persisted as PersistedX402Challenge);
      return { schema: CAS_SCHEMA, ...result };
    }
  }
}
