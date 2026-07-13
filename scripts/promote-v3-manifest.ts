import "./lib/load-env";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { createV3SuiteContext } from "../packages/sdk/src/v3-contract";
import {
  calculateV3SuiteReleaseId,
  parseV3SuiteManifest,
  V3_SUITE_MODULE_KEYS,
  type V3SuiteManifest,
  type V3SuiteModuleKey,
} from "../packages/sdk/src/v3-manifest";
import { isMainModule } from "./lib/is-main";
import {
  assertRequiredConfirmations,
  assertV3DeploymentArguments,
  parseV3BroadcastRun,
  type ParsedV3BroadcastRun,
} from "./lib/v3-release";
import { V3_ARTIFACT_MODULES, validateV3Artifacts } from "./validate-v3-artifacts";

export type PromoteV3ManifestOptions = {
  root?: string;
  rpcUrl: string;
  expectedCommit?: string;
  manifestPath?: string;
  runLatestPath?: string;
};

type VerifiedChainEvidence = {
  runtimeCodeHashes: Record<V3SuiteModuleKey, Hex>;
  deploymentBlock: bigint;
  deployedAt: string;
};

const ZERO_HASH = `0x${"0".repeat(64)}`;

function fail(message: string): never {
  throw new Error(`V3 manifest promotion failed: ${message}`);
}

function checkedServerRpcUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    fail("RPC_URL must be an absolute URL.");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
  ) {
    fail("RPC_URL must be an HTTPS URL without embedded userinfo or a fragment.");
  }
  return url;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

const DEPLOYMENT_BOUND_PATHS = [
  "contracts/src/v3",
  "contracts/script/DeployV3.s.sol",
  "contracts/foundry.toml",
  "contracts/remappings.txt",
  "apps/web/public/abi/v3",
  "apps/web/public/deployment-manifest.v3.json",
  "fixtures/name-normalization.json",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/deploy-v3.ts",
] as const;

function assertLocalDeploymentSource(root: string, expectedCommit: string) {
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  const commit = spawnSync("git", ["cat-file", "-e", `${expectedCommit}^{commit}`], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  const deploymentDiff = spawnSync(
    "git",
    ["diff", "--quiet", expectedCommit, "--", ...DEPLOYMENT_BOUND_PATHS],
    { cwd: root, encoding: "utf8", shell: false },
  );
  if (
    status.status !== 0
    || status.stdout.trim() !== ""
    || commit.status !== 0
    || deploymentDiff.status !== 0
  ) {
    fail(
      "promotion requires a clean tree whose deployment-bound sources exactly match SOURCE_COMMIT.",
    );
  }
}

function assertRecordedCommit(root: string, recordedCommit: string | null, expectedCommit: string) {
  if (!recordedCommit) fail("run-latest source commit is missing.");
  const resolved = spawnSync(
    "git",
    ["rev-parse", "--verify", `${recordedCommit}^{commit}`],
    { cwd: root, encoding: "utf8", shell: false },
  );
  if (resolved.status !== 0 || resolved.stdout.trim() !== expectedCommit) {
    fail("run-latest source commit differs from SOURCE_COMMIT.");
  }
}

async function readAbi(root: string, key: V3SuiteModuleKey): Promise<Abi> {
  const path = resolve(
    root,
    `apps/web/public/abi/v3/${V3_ARTIFACT_MODULES[key].contract}.json`,
  );
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(value)) fail(`${V3_ARTIFACT_MODULES[key].contract} ABI is not an array.`);
  return value as Abi;
}

function sameAddress(left: Address | null | undefined, right: Address) {
  return left !== null && left !== undefined && getAddress(left) === right;
}

async function verifyChainEvidence(
  root: string,
  rpcUrl: string,
  draft: V3SuiteManifest,
  evidence: ParsedV3BroadcastRun,
): Promise<VerifiedChainEvidence> {
  const client = createPublicClient({
    transport: http(rpcUrl, { retryCount: 2, timeout: 15_000 }),
  });
  if (await client.getChainId() !== draft.chainId) fail("RPC chain ID differs from the draft manifest.");
  const latestBlock = await client.getBlockNumber();
  const receiptBlocks: bigint[] = [];

  for (const key of V3_SUITE_MODULE_KEYS) {
    const module = evidence.modules[key];
    const [receipt, transaction] = await Promise.all([
      client.getTransactionReceipt({ hash: module.hash }),
      client.getTransaction({ hash: module.hash }),
    ]);
    if (
      receipt.status !== "success"
      || receipt.transactionHash.toLowerCase() !== module.hash
      || receipt.blockNumber !== module.recordedBlockNumber
      || receipt.blockHash.toLowerCase() === ZERO_HASH
      || (module.recordedBlockHash !== null
        && receipt.blockHash.toLowerCase() !== module.recordedBlockHash)
      || !sameAddress(receipt.contractAddress, module.address)
      || receipt.to !== null
      || transaction.to !== null
      || getAddress(transaction.from) !== module.from
    ) fail(`${module.contractName} receipt/transaction differs from run-latest evidence.`);
    receiptBlocks.push(receipt.blockNumber);
  }

  const registryAbi = await readAbi(root, "registry");
  const [configureReceipt, configureTransaction] = await Promise.all([
    client.getTransactionReceipt({ hash: evidence.configure.hash }),
    client.getTransaction({ hash: evidence.configure.hash }),
  ]);
  if (
    configureReceipt.status !== "success"
    || configureReceipt.transactionHash.toLowerCase() !== evidence.configure.hash
    || configureReceipt.blockNumber !== evidence.configure.recordedBlockNumber
    || configureReceipt.blockHash.toLowerCase() === ZERO_HASH
    || (evidence.configure.recordedBlockHash !== null
      && configureReceipt.blockHash.toLowerCase() !== evidence.configure.recordedBlockHash)
    || !sameAddress(configureReceipt.to, evidence.configure.to)
    || !sameAddress(configureTransaction.to, evidence.configure.to)
    || getAddress(configureTransaction.from) !== evidence.configure.from
  ) fail("configureSuite receipt/transaction differs from run-latest evidence.");
  let decoded: { functionName: string; args: readonly unknown[] | undefined };
  try {
    decoded = decodeFunctionData({ abi: registryAbi, data: configureTransaction.input });
  } catch {
    fail("configureSuite on-chain calldata cannot be decoded by the local registry ABI.");
  }
  const decodedArgs = decoded.args;
  if (decoded.functionName !== "configureSuite" || !Array.isArray(decodedArgs) || decodedArgs.length !== 4) {
    fail("configuration receipt does not execute configureSuite with four addresses.");
  }
  decodedArgs.forEach((argument, index) => {
    if (typeof argument !== "string" || getAddress(argument) !== evidence.configure.arguments[index]) {
      fail(`configureSuite on-chain argument ${index} differs from run-latest evidence.`);
    }
  });
  receiptBlocks.push(configureReceipt.blockNumber);
  assertRequiredConfirmations(latestBlock, receiptBlocks, draft.requiredConfirmations);

  const runtimeCodeHashes = {} as Record<V3SuiteModuleKey, Hex>;
  for (const key of V3_SUITE_MODULE_KEYS) {
    const bytecode = await client.getBytecode({ address: evidence.modules[key].address });
    if (!bytecode || bytecode === "0x") fail(`${V3_ARTIFACT_MODULES[key].contract} has no runtime bytecode.`);
    runtimeCodeHashes[key] = keccak256(bytecode);
  }
  const deploymentBlock = receiptBlocks.reduce((lowest, value) => value < lowest ? value : lowest);
  const deploymentTimestamp = (await client.getBlock({ blockNumber: deploymentBlock })).timestamp;
  if (deploymentTimestamp > BigInt(Number.MAX_SAFE_INTEGER) / 1_000n) {
    fail("deployment timestamp cannot be represented as an ISO date.");
  }
  return {
    runtimeCodeHashes,
    deploymentBlock,
    deployedAt: new Date(Number(deploymentTimestamp) * 1_000).toISOString(),
  };
}

async function buildCandidate(
  draft: V3SuiteManifest,
  evidence: ParsedV3BroadcastRun,
  verified: VerifiedChainEvidence,
  sourceCommit: string,
): Promise<V3SuiteManifest> {
  const identity = assertV3DeploymentArguments(evidence, draft);
  const candidate = structuredClone(draft);
  candidate.releaseStatus = "candidate";
  for (const key of V3_SUITE_MODULE_KEYS) {
    candidate.contracts[key].address = evidence.modules[key].address;
    candidate.contracts[key].runtimeCodeHash = verified.runtimeCodeHashes[key];
  }
  candidate.normalization.attestor = identity.attestor;
  candidate.wiring.suiteConfigured = true;
  candidate.deployment = {
    blockNumber: verified.deploymentBlock.toString(),
    deployedAt: verified.deployedAt,
    transactionHashes: evidence.transactionHashes,
    owner: identity.owner,
    treasury: identity.treasury,
  };
  candidate.migration.startsAt = identity.migrationStartsAt;
  candidate.migration.endsAt = identity.migrationEndsAt;
  candidate.gitCommit = sourceCommit;
  candidate.suiteReleaseId = await calculateV3SuiteReleaseId(candidate);
  return parseV3SuiteManifest(candidate);
}

function localArtifactFetcher(
  root: string,
  manifest: V3SuiteManifest,
): typeof fetch {
  const manifestPath = "/deployment-manifest.v3.json";
  const abiPaths = new Map<string, string>();
  for (const key of V3_SUITE_MODULE_KEYS) {
    abiPaths.set(
      manifest.contracts[key].abiUrl,
      resolve(root, `apps/web/public/abi/v3/${V3_ARTIFACT_MODULES[key].contract}.json`),
    );
  }
  return async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.pathname === manifestPath) {
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const localPath = abiPaths.get(url.pathname);
    if (!localPath) return new Response("Not found", { status: 404 });
    return new Response(await readFile(localPath), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

async function verifyCandidateWithSdk(
  root: string,
  rpcUrl: string,
  candidate: V3SuiteManifest,
) {
  const adapterOrigin = "https://v3-promotion.invalid";
  const context = await createV3SuiteContext({
    manifestUrl: `${adapterOrigin}/deployment-manifest.v3.json`,
    rpcUrl,
    fetcher: localArtifactFetcher(root, candidate),
    allowedManifestOrigins: [adapterOrigin],
    allowedRpcOrigins: [new URL(rpcUrl).origin],
  });
  if (context.manifest.suiteReleaseId !== candidate.suiteReleaseId) {
    fail("SDK context returned a different suite release identity.");
  }
}

export async function promoteV3Manifest(options: PromoteV3ManifestOptions) {
  const root = resolve(options.root ?? process.cwd());
  const rpcUrl = checkedServerRpcUrl(options.rpcUrl).href;
  const manifestPath = resolve(
    options.manifestPath ?? resolve(root, "apps/web/public/deployment-manifest.v3.json"),
  );
  const draftBytes = await readFile(manifestPath);
  const draft = parseV3SuiteManifest(JSON.parse(draftBytes.toString("utf8")) as unknown);
  if (draft.releaseStatus !== "draft") fail("only a draft schema-v4 manifest can be promoted.");
  await validateV3Artifacts({ root });
  const runLatestPath = resolve(
    options.runLatestPath
      ?? resolve(root, `contracts/broadcast/DeployV3.s.sol/${draft.chainId}/run-latest.json`),
  );
  const run = JSON.parse(await readFile(runLatestPath, "utf8")) as unknown;
  const evidence = parseV3BroadcastRun(run, draft.chainId);
  const expectedCommit = options.expectedCommit ?? process.env.SOURCE_COMMIT?.trim();
  if (!expectedCommit || !/^[a-f0-9]{40}$/.test(expectedCommit)) {
    fail("SOURCE_COMMIT must declare the reviewed lowercase 40-character source commit.");
  }
  assertRecordedCommit(root, evidence.commit, expectedCommit);
  assertLocalDeploymentSource(root, expectedCommit);
  assertV3DeploymentArguments(evidence, draft);
  const verified = await verifyChainEvidence(root, rpcUrl, draft, evidence);
  const candidate = await buildCandidate(draft, evidence, verified, expectedCommit);
  await verifyCandidateWithSdk(root, rpcUrl, candidate);

  const unchangedDraft = await readFile(manifestPath);
  if (sha256(unchangedDraft) !== sha256(draftBytes)) {
    fail("draft manifest changed during promotion; retry from a clean release state.");
  }
  const temporaryPath = `${manifestPath}.candidate-${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  try {
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return { manifestPath, runLatestPath, candidate };
}

if (isMainModule(import.meta.url)) {
  const rpcUrl = process.env.RPC_URL?.trim();
  if (!rpcUrl) {
    console.error("V3 manifest promotion failed closed. RPC_URL is required; no candidate was written.");
    process.exitCode = 1;
  } else {
    try {
      const result = await promoteV3Manifest({ rpcUrl });
      console.log(
        `Promoted verified V3 candidate ${result.candidate.suiteReleaseId} after ${result.candidate.requiredConfirmations} confirmations.`,
      );
    } catch {
      console.error("V3 manifest promotion failed closed. No candidate was written.");
      process.exitCode = 1;
    }
  }
}
