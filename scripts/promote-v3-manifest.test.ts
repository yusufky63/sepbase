import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAddress, zeroAddress, type Address } from "viem";
import {
  calculateV3SuiteReleaseId,
  parseV3SuiteManifest,
  type V3SuiteManifest,
  type V3SuiteModuleKey,
} from "../packages/sdk/src/v3-manifest";
import {
  assertRequiredConfirmations,
  assertV3DeploymentArguments,
  parseV3BroadcastRun,
  V3_DEPLOYMENT_ORDER,
} from "./lib/v3-release";
import { V3_ARTIFACT_MODULES } from "./validate-v3-artifacts";

type FixtureTransaction = {
  hash: string;
  transactionType: "CREATE" | "CALL";
  contractName: string | null;
  contractAddress: string | null;
  function: string | null;
  arguments: string[];
  transaction: { from: string; to: string | null };
};

type FixtureReceipt = {
  status: string;
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  contractAddress: string | null;
  to: string | null;
};

type RunFixture = {
  transactions: FixtureTransaction[];
  receipts: FixtureReceipt[];
  pending: unknown[];
  chain: number;
  commit: string | null;
};

const address = (index: number) => getAddress(`0x${index.toString(16).padStart(40, "0")}`);
const hash = (index: number) => `0x${index.toString(16).padStart(64, "0")}`;
const owner = address(100);
const treasury = address(101);
const attestor = address(102);
const configurator = address(103);

async function draftFixture() {
  const value = JSON.parse(await readFile(
    resolve(process.cwd(), "apps/web/public/deployment-manifest.v3.json"),
    "utf8",
  )) as V3SuiteManifest;
  value.releaseStatus = "draft";
  value.normalization.attestor = null;
  value.wiring.suiteConfigured = false;
  value.deployment = {
    blockNumber: null,
    deployedAt: null,
    transactionHashes: [],
    owner: null,
    treasury: null,
  };
  value.migration.startsAt = null;
  value.migration.endsAt = null;
  for (const module of Object.values(value.contracts)) {
    module.address = null;
    module.runtimeCodeHash = null;
  }
  value.suiteReleaseId = await calculateV3SuiteReleaseId(value);
  return parseV3SuiteManifest(value);
}

function moduleAddresses() {
  return Object.fromEntries(
    V3_DEPLOYMENT_ORDER.map((key, index) => [key, address(index + 1)]),
  ) as Record<V3SuiteModuleKey, Address>;
}

function packedMultipliers(draft: V3SuiteManifest) {
  const [one, two, three] = draft.pricing.shortNamePriceMultipliers;
  return String(one | (two << 8) | (three << 16));
}

function constructorArguments(
  key: V3SuiteModuleKey,
  draft: V3SuiteManifest,
  modules: Record<V3SuiteModuleKey, Address>,
) {
  switch (key) {
    case "registry": return [
      draft.collection.name,
      draft.collection.symbol,
      draft.suffix,
      draft.suffixNode,
      draft.reverseRootNode,
      draft.normalization.profileHash,
      owner,
      configurator,
      draft.gracePeriodSeconds,
      draft.metadataBaseURI,
    ];
    case "resolver": return [modules.registry];
    case "controller": return [
      modules.registry,
      modules.resolver,
      owner,
      treasury,
      draft.commitment.minAgeSeconds,
      draft.commitment.maxAgeSeconds,
      attestor,
      draft.normalization.maxAttestationValiditySeconds,
      draft.settlement.kind === "native" ? "0" : "1",
      draft.settlement.tokenAddress ?? zeroAddress,
      draft.pricing.annualPriceBaseUnits,
      packedMultipliers(draft),
      String(draft.pricing.referralRewardBps),
    ];
    case "migration": return [
      modules.registry,
      modules.resolver,
      draft.migration.legacyContract,
      String(draft.migration.sourceChainId),
      "1900000000",
      "2000000000",
      owner,
    ];
    case "marketplace": return [
      modules.registry,
      modules.controller,
      owner,
      treasury,
      String(draft.pricing.marketplaceFeeBps),
      String(draft.marketplace.minBidIncrementBps),
      draft.marketplace.antiSnipingWindowSeconds,
      draft.marketplace.extensionDurationSeconds,
      String(draft.marketplace.maxExtensions),
    ];
    case "universalResolver": return [modules.registry];
    case "marketLens": return [modules.marketplace];
  }
}

function validRun(draft: V3SuiteManifest): RunFixture {
  const modules = moduleAddresses();
  const transactions: FixtureTransaction[] = V3_DEPLOYMENT_ORDER.map((key, index) => ({
    hash: hash(index + 1),
    transactionType: "CREATE",
    contractName: V3_ARTIFACT_MODULES[key].contract,
    contractAddress: modules[key],
    function: null,
    arguments: constructorArguments(key, draft, modules),
    transaction: { from: configurator, to: null },
  }));
  transactions.push({
    hash: hash(8),
    transactionType: "CALL",
    contractName: "ChainNameRegistryV3",
    contractAddress: modules.registry,
    function: "configureSuite(address,address,address,address)",
    arguments: [modules.controller, modules.resolver, modules.migration, modules.marketplace],
    transaction: { from: configurator, to: modules.registry },
  });
  const receipts: FixtureReceipt[] = transactions.map((transaction, index) => ({
    status: "0x1",
    transactionHash: transaction.hash,
    blockHash: hash(1_000 + index),
    blockNumber: `0x${(100 + index).toString(16)}`,
    contractAddress: transaction.transactionType === "CREATE" ? transaction.contractAddress : null,
    to: transaction.transaction.to,
  }));
  return {
    transactions,
    receipts,
    pending: [],
    chain: draft.chainId,
    commit: "a".repeat(40),
  };
}

const draft = await draftFixture();
const positive = validRun(draft);
const parsed = parseV3BroadcastRun(positive, draft.chainId);
const identity = assertV3DeploymentArguments(parsed, draft);
assert.equal(Object.keys(parsed.modules).length, 7);
assert.equal(parsed.transactionHashes.length, 8);
assert.equal(identity.owner, owner);
assert.equal(identity.treasury, treasury);
assert.equal(identity.attestor, attestor);
assert.equal(identity.configurator, configurator);
assert.doesNotThrow(() => assertRequiredConfirmations(110n, [100n, 106n], 5));

const partial = structuredClone(positive);
partial.transactions.pop();
partial.receipts.pop();
assert.throws(
  () => parseV3BroadcastRun(partial, draft.chainId),
  /exactly seven CREATE transactions/i,
);

const failedReceipt = structuredClone(positive);
failedReceipt.receipts[0]!.status = "0x0";
assert.throws(
  () => parseV3BroadcastRun(failedReceipt, draft.chainId),
  /not successful/i,
);

const fakeBlockHash = structuredClone(positive);
fakeBlockHash.receipts[0]!.blockHash = `0x${"0".repeat(64)}`;
const parsedWithOpStackPlaceholder = parseV3BroadcastRun(fakeBlockHash, draft.chainId);
assert.equal(parsedWithOpStackPlaceholder.modules.registry.recordedBlockHash, null);

const malformedBlockHash = structuredClone(positive);
malformedBlockHash.receipts[0]!.blockHash = "0x1234";
assert.throws(
  () => parseV3BroadcastRun(malformedBlockHash, draft.chainId),
  /bytes32 hash/i,
);

const duplicateCreate = structuredClone(positive);
duplicateCreate.transactions[1]!.contractName = duplicateCreate.transactions[0]!.contractName;
assert.throws(
  () => parseV3BroadcastRun(duplicateCreate, draft.chainId),
  /created more than once/i,
);

const configureDrift = structuredClone(positive);
configureDrift.transactions[7]!.arguments[0] = address(999);
assert.throws(
  () => assertV3DeploymentArguments(
    parseV3BroadcastRun(configureDrift, draft.chainId),
    draft,
  ),
  /configureSuite argument 0/i,
);

const authorityDrift = structuredClone(positive);
authorityDrift.transactions[2]!.arguments[2] = address(998);
assert.throws(
  () => assertV3DeploymentArguments(
    parseV3BroadcastRun(authorityDrift, draft.chainId),
    draft,
  ),
  /controller owner/i,
);

const pending = structuredClone(positive);
pending.pending.push({ hash: hash(99) });
assert.throws(
  () => parseV3BroadcastRun(pending, draft.chainId),
  /pending transactions/i,
);

assert.throws(
  () => assertRequiredConfirmations(103n, [100n], 5),
  /4 confirmations; 5 are required/i,
);

console.log("V3 promotion parser tests passed (positive + OP Stack placeholder, 8 fail-closed cases).");
