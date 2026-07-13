import {
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  V3_SUITE_MODULE_KEYS,
  type V3SuiteManifest,
  type V3SuiteModuleKey,
} from "../../packages/sdk/src/v3-manifest";
import { V3_ARTIFACT_MODULES } from "../validate-v3-artifacts";

const ZERO_HASH = `0x${"0".repeat(64)}`;
const CONFIGURE_SUITE_SIGNATURE = "configureSuite(address,address,address,address)";

export const V3_DEPLOYMENT_ORDER = [
  "registry",
  "resolver",
  "controller",
  "migration",
  "marketplace",
  "universalResolver",
  "marketLens",
] as const satisfies readonly V3SuiteModuleKey[];

export type V3RunModuleEvidence = {
  key: V3SuiteModuleKey;
  contractName: string;
  address: Address;
  hash: Hash;
  from: Address;
  arguments: string[];
  recordedBlockNumber: bigint;
  recordedBlockHash: Hash | null;
};

export type V3ConfigureEvidence = {
  hash: Hash;
  from: Address;
  to: Address;
  arguments: [Address, Address, Address, Address];
  recordedBlockNumber: bigint;
  recordedBlockHash: Hash | null;
};

export type ParsedV3BroadcastRun = {
  chainId: number;
  modules: Record<V3SuiteModuleKey, V3RunModuleEvidence>;
  configure: V3ConfigureEvidence;
  transactionHashes: Hash[];
  commit: string | null;
};

export type V3DeploymentIdentity = {
  owner: Address;
  treasury: Address;
  attestor: Address;
  configurator: Address;
  migrationStartsAt: string;
  migrationEndsAt: string;
};

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`V3 release evidence rejected: ${message}`);
}

function objectValue(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string.`);
  return value;
}

function nullableString(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  return stringValue(value, label);
}

function addressValue(value: unknown, label: string): Address {
  const input = stringValue(value, label);
  if (!isAddress(input)) fail(`${label} must be an EVM address.`);
  const address = getAddress(input);
  if (address === zeroAddress) fail(`${label} cannot be zero.`);
  return address;
}

function nullableAddress(value: unknown, label: string): Address | null {
  if (value === null) return null;
  return addressValue(value, label);
}

function hashValue(value: unknown, label: string): Hash {
  const input = stringValue(value, label);
  if (!/^0x[0-9a-fA-F]{64}$/.test(input) || input.toLowerCase() === ZERO_HASH) {
    fail(`${label} must be a non-zero bytes32 hash.`);
  }
  return input.toLowerCase() as Hash;
}

function recordedBlockHashValue(value: unknown, label: string): Hash | null {
  const input = stringValue(value, label);
  if (!/^0x[0-9a-fA-F]{64}$/.test(input)) {
    fail(`${label} must be a bytes32 hash.`);
  }
  return input.toLowerCase() === ZERO_HASH ? null : input.toLowerCase() as Hash;
}

function quantity(value: unknown, label: string) {
  const input = stringValue(value, label);
  if (!/^0x[0-9a-fA-F]+$/.test(input)) fail(`${label} must be a hex quantity.`);
  const parsed = BigInt(input);
  if (parsed <= 0n) fail(`${label} must be positive.`);
  return parsed;
}

function stringArguments(value: unknown, label: string): string[] {
  return arrayValue(value, label).map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function moduleKeyForContract(contractName: string): V3SuiteModuleKey | null {
  for (const key of V3_SUITE_MODULE_KEYS) {
    if (V3_ARTIFACT_MODULES[key].contract === contractName) return key;
  }
  return null;
}

function sameAddress(left: string, right: Address) {
  return isAddress(left) && getAddress(left) === right;
}

function receiptByHash(rawReceipts: unknown[]) {
  const result = new Map<Hash, JsonObject>();
  for (const [index, rawReceipt] of rawReceipts.entries()) {
    const receipt = objectValue(rawReceipt, `receipts[${index}]`);
    const hash = hashValue(receipt.transactionHash, `receipts[${index}].transactionHash`);
    if (result.has(hash)) fail(`receipt hash ${hash} is duplicated.`);
    if (receipt.status !== "0x1") fail(`receipt ${hash} is not successful.`);
    recordedBlockHashValue(receipt.blockHash, `receipt ${hash} blockHash`);
    quantity(receipt.blockNumber, `receipt ${hash} blockNumber`);
    result.set(hash, receipt);
  }
  return result;
}

export function parseV3BroadcastRun(
  raw: unknown,
  expectedChainId: number,
): ParsedV3BroadcastRun {
  const run = objectValue(raw, "run-latest");
  if (run.chain !== expectedChainId) {
    fail(`run-latest chain must equal ${expectedChainId}.`);
  }
  const pending = arrayValue(run.pending, "run-latest.pending");
  if (pending.length !== 0) fail("run-latest contains pending transactions.");
  const transactions = arrayValue(run.transactions, "run-latest.transactions");
  const receipts = arrayValue(run.receipts, "run-latest.receipts");
  if (transactions.length !== 8 || receipts.length !== 8) {
    fail("run-latest must contain exactly seven CREATE transactions and one configureSuite call with receipts.");
  }
  const receiptsByHash = receiptByHash(receipts);
  const modules = {} as Record<V3SuiteModuleKey, V3RunModuleEvidence>;
  const transactionHashes: Hash[] = [];
  let configure: V3ConfigureEvidence | undefined;

  for (const [index, rawTransaction] of transactions.entries()) {
    const entry = objectValue(rawTransaction, `transactions[${index}]`);
    const hash = hashValue(entry.hash, `transactions[${index}].hash`);
    if (transactionHashes.includes(hash)) fail(`transaction hash ${hash} is duplicated.`);
    transactionHashes.push(hash);
    const receipt = receiptsByHash.get(hash);
    if (!receipt) fail(`transaction ${hash} has no matching receipt.`);
    const recordedBlockNumber = quantity(receipt.blockNumber, `receipt ${hash} blockNumber`);
    const recordedBlockHash = recordedBlockHashValue(receipt.blockHash, `receipt ${hash} blockHash`);
    const transaction = objectValue(entry.transaction, `transactions[${index}].transaction`);
    const from = addressValue(transaction.from, `transactions[${index}].transaction.from`);
    const to = nullableAddress(transaction.to, `transactions[${index}].transaction.to`);
    const args = stringArguments(entry.arguments, `transactions[${index}].arguments`);
    const transactionType = stringValue(entry.transactionType, `transactions[${index}].transactionType`);

    if (transactionType === "CREATE") {
      if (to !== null || receipt.to !== null) fail(`CREATE transaction ${hash} must not have a destination.`);
      const contractName = stringValue(entry.contractName, `transactions[${index}].contractName`);
      const key = moduleKeyForContract(contractName);
      if (!key) fail(`unexpected CREATE contract ${contractName}.`);
      if (modules[key]) fail(`${contractName} was created more than once.`);
      const address = addressValue(entry.contractAddress, `${contractName}.contractAddress`);
      const receiptAddress = addressValue(receipt.contractAddress, `${contractName} receipt contractAddress`);
      if (address !== receiptAddress) fail(`${contractName} receipt address differs from transaction evidence.`);
      modules[key] = {
        key,
        contractName,
        address,
        hash,
        from,
        arguments: args,
        recordedBlockNumber,
        recordedBlockHash,
      };
      continue;
    }

    if (transactionType !== "CALL" || configure) {
      fail(`transaction ${hash} is not the single configureSuite CALL.`);
    }
    if (entry.function !== CONFIGURE_SUITE_SIGNATURE) {
      fail(`transaction ${hash} is not ${CONFIGURE_SUITE_SIGNATURE}.`);
    }
    if (!to || args.length !== 4) fail("configureSuite evidence has an invalid destination or arguments.");
    const receiptTo = addressValue(receipt.to, "configureSuite receipt.to");
    if (receiptTo !== to) fail("configureSuite receipt destination differs from transaction evidence.");
    configure = {
      hash,
      from,
      to,
      arguments: args.map((argument, argumentIndex) =>
        addressValue(argument, `configureSuite.arguments[${argumentIndex}]`)
      ) as [Address, Address, Address, Address],
      recordedBlockNumber,
      recordedBlockHash,
    };
  }

  for (const key of V3_SUITE_MODULE_KEYS) {
    if (!modules[key]) fail(`${V3_ARTIFACT_MODULES[key].contract} CREATE evidence is missing.`);
  }
  if (!configure) fail("configureSuite CALL evidence is missing.");
  if (receiptsByHash.size !== transactionHashes.length) fail("run-latest contains unmatched receipts.");
  if (new Set(Object.values(modules).map((module) => module.address)).size !== 7) {
    fail("the seven module addresses must be distinct.");
  }
  const commit = nullableString(run.commit, "run-latest.commit");
  if (commit !== null && !/^[a-f0-9]{7,40}$/.test(commit)) {
    fail("run-latest.commit must be a lowercase 7-40 character git commit or null.");
  }
  return { chainId: expectedChainId, modules, configure, transactionHashes, commit };
}

function exactArguments(
  evidence: ParsedV3BroadcastRun,
  key: V3SuiteModuleKey,
  count: number,
) {
  const args = evidence.modules[key].arguments;
  if (args.length !== count) fail(`${V3_ARTIFACT_MODULES[key].contract} must have exactly ${count} constructor arguments.`);
  return args;
}

function expectText(actual: string, expected: string, label: string) {
  if (actual !== expected) fail(`${label} differs from the draft manifest.`);
}

function expectHex(actual: string, expected: Hex, label: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) fail(`${label} differs from the draft manifest.`);
}

function expectAddress(actual: string, expected: Address, label: string) {
  if (!sameAddress(actual, expected)) fail(`${label} differs from the expected deployment address.`);
}

function expectedPackedMultipliers(manifest: V3SuiteManifest) {
  const [one, two, three] = manifest.pricing.shortNamePriceMultipliers;
  return String(one | (two << 8) | (three << 16));
}

export function assertV3DeploymentArguments(
  evidence: ParsedV3BroadcastRun,
  draft: V3SuiteManifest,
): V3DeploymentIdentity {
  if (draft.releaseStatus !== "draft") fail("promotion input manifest must remain draft.");
  if (draft.chainId !== evidence.chainId) fail("draft and run-latest chain IDs differ.");
  const module = (key: V3SuiteModuleKey) => evidence.modules[key].address;
  const registry = exactArguments(evidence, "registry", 10);
  const resolver = exactArguments(evidence, "resolver", 1);
  const controller = exactArguments(evidence, "controller", 13);
  const migration = exactArguments(evidence, "migration", 7);
  const marketplace = exactArguments(evidence, "marketplace", 9);
  const universalResolver = exactArguments(evidence, "universalResolver", 1);
  const marketLens = exactArguments(evidence, "marketLens", 1);

  expectText(registry[0]!, draft.collection.name, "registry collection name");
  expectText(registry[1]!, draft.collection.symbol, "registry collection symbol");
  expectText(registry[2]!, draft.suffix, "registry suffix");
  expectHex(registry[3]!, draft.suffixNode, "registry suffix node");
  expectHex(registry[4]!, draft.reverseRootNode, "registry reverse root");
  expectHex(registry[5]!, draft.normalization.profileHash, "registry normalization profile");
  const owner = addressValue(registry[6], "registry owner");
  const configurator = addressValue(registry[7], "registry suite configurator");
  expectText(registry[8]!, draft.gracePeriodSeconds, "registry grace period");
  expectText(registry[9]!, draft.metadataBaseURI, "registry metadata URI");

  expectAddress(resolver[0]!, module("registry"), "resolver registry");
  expectAddress(controller[0]!, module("registry"), "controller registry");
  expectAddress(controller[1]!, module("resolver"), "controller resolver");
  expectAddress(controller[2]!, owner, "controller owner");
  const treasury = addressValue(controller[3], "controller treasury");
  expectText(controller[4]!, draft.commitment.minAgeSeconds, "controller minimum commitment age");
  expectText(controller[5]!, draft.commitment.maxAgeSeconds, "controller maximum commitment age");
  const attestor = addressValue(controller[6], "controller normalization attestor");
  expectText(
    controller[7]!,
    draft.normalization.maxAttestationValiditySeconds,
    "controller maximum attestation validity",
  );
  expectText(controller[8]!, draft.settlement.kind === "native" ? "0" : "1", "controller settlement kind");
  expectAddress(
    controller[9]!,
    draft.settlement.tokenAddress ?? zeroAddress,
    "controller settlement token",
  );
  expectText(controller[10]!, draft.pricing.annualPriceBaseUnits, "controller annual price");
  expectText(controller[11]!, expectedPackedMultipliers(draft), "controller short-name multipliers");
  expectText(controller[12]!, String(draft.pricing.referralRewardBps), "controller referral BPS");

  expectAddress(migration[0]!, module("registry"), "migration registry");
  expectAddress(migration[1]!, module("resolver"), "migration resolver");
  expectAddress(migration[2]!, draft.migration.legacyContract, "migration legacy registry");
  expectText(migration[3]!, String(draft.migration.sourceChainId), "migration source chain");
  const migrationStartsAt = stringValue(migration[4], "migration start");
  const migrationEndsAt = stringValue(migration[5], "migration end");
  if (!/^(0|[1-9][0-9]{0,19})$/.test(migrationStartsAt)
    || !/^(0|[1-9][0-9]{0,19})$/.test(migrationEndsAt)
    || BigInt(migrationStartsAt) >= BigInt(migrationEndsAt)) {
    fail("migration window arguments are invalid.");
  }
  expectAddress(migration[6]!, owner, "migration owner");

  expectAddress(marketplace[0]!, module("registry"), "marketplace registry");
  expectAddress(marketplace[1]!, module("controller"), "marketplace controller");
  expectAddress(marketplace[2]!, owner, "marketplace owner");
  expectAddress(marketplace[3]!, treasury, "marketplace treasury");
  expectText(marketplace[4]!, String(draft.pricing.marketplaceFeeBps), "marketplace fee BPS");
  expectText(marketplace[5]!, String(draft.marketplace.minBidIncrementBps), "marketplace minimum bid BPS");
  expectText(marketplace[6]!, draft.marketplace.antiSnipingWindowSeconds, "marketplace anti-sniping window");
  expectText(marketplace[7]!, draft.marketplace.extensionDurationSeconds, "marketplace extension duration");
  expectText(marketplace[8]!, String(draft.marketplace.maxExtensions), "marketplace maximum extensions");
  expectAddress(universalResolver[0]!, module("registry"), "Universal Resolver registry");
  expectAddress(marketLens[0]!, module("marketplace"), "MarketLens marketplace");

  const expectedConfigure = [
    module("controller"),
    module("resolver"),
    module("migration"),
    module("marketplace"),
  ] as const;
  if (evidence.configure.to !== module("registry")) fail("configureSuite destination is not the created registry.");
  expectedConfigure.forEach((expected, index) => {
    if (evidence.configure.arguments[index] !== expected) fail(`configureSuite argument ${index} does not match the created module.`);
  });
  for (const transaction of [...Object.values(evidence.modules), evidence.configure]) {
    if (transaction.from !== configurator) fail("not every deployment/configuration transaction uses the suite configurator.");
  }
  return { owner, treasury, attestor, configurator, migrationStartsAt, migrationEndsAt };
}

export function assertRequiredConfirmations(
  latestBlock: bigint,
  receiptBlocks: readonly bigint[],
  requiredConfirmations: number,
) {
  if (!Number.isInteger(requiredConfirmations) || requiredConfirmations < 1) {
    fail("required confirmations must be a positive integer.");
  }
  for (const blockNumber of receiptBlocks) {
    if (blockNumber > latestBlock) fail("a receipt block is ahead of the RPC head.");
    const confirmations = latestBlock - blockNumber + 1n;
    if (confirmations < BigInt(requiredConfirmations)) {
      fail(`a deployment receipt has ${confirmations} confirmations; ${requiredConfirmations} are required.`);
    }
  }
}
