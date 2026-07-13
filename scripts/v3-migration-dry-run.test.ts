import assert from "node:assert/strict";
import { getAddress, keccak256, toBytes, zeroAddress } from "viem";
import { canonicalMigrationRecord } from "./v3-migration-dry-run";

const owner = getAddress("0x78de409a6306550882328E2a67160471368387FF");
const tokenId = BigInt(keccak256(toBytes("alice")));
const active = {
  tokenId,
  fullName: "alice.sepbase",
  owner,
  status: 1,
  expiresAt: 2_000_000_000n,
  resolvedAddress: owner,
};

const record = canonicalMigrationRecord(active, "sepbase");
assert(record);
assert.equal(record.label, "alice");
assert.equal(record.tokenId, tokenId.toString());
assert.equal(record.status, "active");

assert.equal(canonicalMigrationRecord({ ...active, status: 3 }, "sepbase"), null);
assert.equal(
  canonicalMigrationRecord({ ...active, status: 2, resolvedAddress: zeroAddress }, "sepbase")?.status,
  "grace",
);
assert.throws(
  () => canonicalMigrationRecord({ ...active, fullName: "Alice.sepbase" }, "sepbase"),
  /canonical V2 ASCII grammar/,
);
assert.throws(
  () => canonicalMigrationRecord({ ...active, tokenId: tokenId + 1n }, "sepbase"),
  /does not map exactly/,
);
assert.throws(
  () => canonicalMigrationRecord({ ...active, expiresAt: 0n }, "sepbase"),
  /has no expiry/,
);

console.log("V3 migration dry-run canonical mapping tests passed.");
