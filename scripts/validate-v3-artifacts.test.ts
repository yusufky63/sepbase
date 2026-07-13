import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  calculateV3SuiteReleaseId,
  V3_SUITE_MODULE_KEYS,
  type V3SuiteManifest,
} from "../packages/sdk/src/v3-manifest";
import {
  validateV3Artifacts,
  type V3ArtifactReadFile,
} from "./validate-v3-artifacts";

const root = resolve(process.cwd());
const manifestPath = resolve(
  root,
  "apps/web/public/deployment-manifest.v3.json",
);
const fixturePath = resolve(root, "fixtures/name-normalization.json");
const registryAbiPath = resolve(
  root,
  "apps/web/public/abi/v3/ChainNameRegistryV3.json",
);
const registryArtifactPath = resolve(
  root,
  "contracts/out/ChainNameRegistryV3.sol/ChainNameRegistryV3.json",
);
const controllerSourcePath = resolve(
  root,
  "contracts/src/v3/ChainNameControllerV3.sol",
);

function readerWith(overrides: Map<string, Uint8Array>): V3ArtifactReadFile {
  return async (path) => overrides.get(resolve(path)) ?? readFile(path);
}

async function manifestOverride(
  mutate: (manifest: Record<string, unknown>) => void,
) {
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as Record<string, unknown>;
  mutate(manifest);
  return new Map<string, Uint8Array>([
    [manifestPath, Buffer.from(JSON.stringify(manifest))],
  ]);
}

const report = await validateV3Artifacts({ root });
assert.ok(["draft", "candidate", "live"].includes(report.releaseStatus));
assert.equal(Object.keys(report.moduleAbiSha256).length, 7);

const releaseDrift = await manifestOverride((manifest) => {
  manifest.chainName = "Drifted Base Sepolia";
});
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(releaseDrift) }),
  /release ID/i,
);

const missingModule = await manifestOverride((manifest) => {
  const contracts = manifest.contracts as Record<string, unknown>;
  delete contracts.marketLens;
});
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(missingModule) }),
  /exactly these seven keys/i,
);

const selectorDrift = await manifestOverride((manifest) => {
  (manifest.wiring as Record<string, unknown>).configureSuiteSelector = "0x00000000";
});
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(selectorDrift) }),
  /manifest validation failed/i,
);

const candidateWithoutEvidence = JSON.parse(
  await readFile(manifestPath, "utf8"),
) as V3SuiteManifest;
candidateWithoutEvidence.releaseStatus = "candidate";
for (const key of V3_SUITE_MODULE_KEYS) {
  candidateWithoutEvidence.contracts[key].address = null;
  candidateWithoutEvidence.contracts[key].runtimeCodeHash = null;
}
candidateWithoutEvidence.normalization.attestor = null;
candidateWithoutEvidence.wiring.suiteConfigured = false;
candidateWithoutEvidence.deployment = {
  blockNumber: null,
  deployedAt: null,
  transactionHashes: [],
  owner: null,
  treasury: null,
};
candidateWithoutEvidence.suiteReleaseId = await calculateV3SuiteReleaseId(
  candidateWithoutEvidence,
);
const candidateWithoutEvidenceOverride = new Map<string, Uint8Array>([
  [manifestPath, Buffer.from(JSON.stringify(candidateWithoutEvidence))],
]);
await assert.rejects(
  validateV3Artifacts({
    root,
    readFile: readerWith(candidateWithoutEvidenceOverride),
  }),
  /candidate\/live manifests require/i,
);

const candidateWithZeroCodeHash = JSON.parse(
  await readFile(manifestPath, "utf8"),
) as V3SuiteManifest;
candidateWithZeroCodeHash.releaseStatus = "candidate";
for (const [index, key] of V3_SUITE_MODULE_KEYS.entries()) {
  candidateWithZeroCodeHash.contracts[key].address =
    `0x${(index + 1).toString(16).padStart(40, "0")}`;
  candidateWithZeroCodeHash.contracts[key].runtimeCodeHash = index === 0
    ? `0x${"0".repeat(64)}`
    : `0x${(index + 1).toString(16).padStart(64, "0")}`;
}
candidateWithZeroCodeHash.normalization.attestor =
  "0x0000000000000000000000000000000000000020";
candidateWithZeroCodeHash.wiring.suiteConfigured = true;
candidateWithZeroCodeHash.deployment = {
  blockNumber: "1",
  deployedAt: "2026-07-12T00:00:00.000Z",
  transactionHashes: Array.from(
    { length: 8 },
    (_, index) =>
      `0x${(index + 1).toString(16).padStart(64, "0")}` as `0x${string}`,
  ),
  owner: "0x0000000000000000000000000000000000000021",
  treasury: "0x0000000000000000000000000000000000000022",
};
candidateWithZeroCodeHash.migration.startsAt = "1";
candidateWithZeroCodeHash.migration.endsAt = "2";
candidateWithZeroCodeHash.suiteReleaseId = await calculateV3SuiteReleaseId(
  candidateWithZeroCodeHash,
);
const zeroCodeHashOverride = new Map<string, Uint8Array>([
  [manifestPath, Buffer.from(JSON.stringify(candidateWithZeroCodeHash))],
]);
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(zeroCodeHashOverride) }),
  /non-zero registry runtime code hash/i,
);

const publicAbiDrift = new Map<string, Uint8Array>([
  [
    registryAbiPath,
    Buffer.concat([await readFile(registryAbiPath), Buffer.from("\n")]),
  ],
]);
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(publicAbiDrift) }),
  /public ABI byte SHA-256/i,
);

const registryArtifact = JSON.parse(
  await readFile(registryArtifactPath, "utf8"),
) as { abi: unknown[] };
registryArtifact.abi = registryArtifact.abi.filter(
  (entry) =>
    typeof entry !== "object"
    || entry === null
    || (entry as { name?: unknown }).name !== "VERSION",
);
const foundryArtifactDrift = new Map<string, Uint8Array>([
  [registryArtifactPath, Buffer.from(JSON.stringify(registryArtifact))],
]);
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(foundryArtifactDrift) }),
  /exact compact Foundry artifact ABI/i,
);

const fixtureDrift = new Map<string, Uint8Array>([
  [fixturePath, Buffer.concat([await readFile(fixturePath), Buffer.from("\n")])],
]);
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(fixtureDrift) }),
  /fixture byte SHA-256/i,
);

const source = await readFile(controllerSourcePath, "utf8");
const sourceDrift = new Map<string, Uint8Array>([
  [
    controllerSourcePath,
    Buffer.from(
      source.replace(
        'string public constant VERSION = "3.0.0";',
        'string public constant VERSION = "3.0.1";',
      ),
    ),
  ],
]);
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(sourceDrift) }),
  /public VERSION/i,
);

const mutableAttestor = new Map<string, Uint8Array>([
  [
    controllerSourcePath,
    Buffer.from(
      source.replace(
        "address public immutable normalizationAttestor;",
        "address public normalizationAttestor;",
      ),
    ),
  ],
]);
await assert.rejects(
  validateV3Artifacts({ root, readFile: readerWith(mutableAttestor) }),
  /normalizationAttestor must have exactly one public immutable declaration/i,
);

console.log("V3 artifact validator tests passed (1 positive, 10 fail-closed cases).");
