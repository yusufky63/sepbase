import assert from "node:assert/strict";
import { parseActivationEvidence } from "./promote-v3-live.js";

const candidateSuiteReleaseId = `sha256:${"11".repeat(32)}` as const;
const sourceCommit = "22".repeat(20);
const valid = {
  schema: "sepbase.v3.release-evidence.v1",
  kind: "audit",
  chainId: 84_532,
  candidateSuiteReleaseId,
  sourceCommit,
  result: "pass",
  completedAt: "2026-07-13T00:00:00.000Z",
} as const;

assert.deepEqual(parseActivationEvidence(valid, {
  kind: "audit",
  candidateSuiteReleaseId,
  sourceCommit,
}), valid);
assert.throws(() => parseActivationEvidence({ ...valid, result: "pending" }, {
  kind: "audit",
  candidateSuiteReleaseId,
  sourceCommit,
}));
assert.throws(() => parseActivationEvidence({ ...valid, unknown: true }, {
  kind: "audit",
  candidateSuiteReleaseId,
  sourceCommit,
}));

console.log("V3 live activation evidence parser tests passed (1 positive, 2 fail-closed cases).");
