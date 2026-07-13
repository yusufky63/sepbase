import "./lib/load-env";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { createV3SuiteContext } from "../packages/sdk/src/v3-contract.js";
import {
  calculateV3SuiteReleaseId,
  parseV3SuiteManifest,
  V3_SUITE_MODULE_KEYS,
  type V3SuiteManifest,
} from "../packages/sdk/src/v3-manifest.js";
import {
  COMPILED_X402_RUNTIME_CAPABILITIES,
  x402RegistrationReadiness,
} from "../apps/web/lib/x402/config.js";
import { v3X402DeploymentProfile } from "../apps/web/lib/x402/deployment-profile.js";
import { isMainModule } from "./lib/is-main.js";

const EVIDENCE_KINDS = ["audit", "soak", "incident-drill", "paid-x402-e2e"] as const;
type EvidenceKind = typeof EVIDENCE_KINDS[number];

export type V3ActivationEvidence = {
  schema: "sepbase.v3.release-evidence.v1";
  kind: EvidenceKind;
  chainId: 84532;
  candidateSuiteReleaseId: `sha256:${string}`;
  sourceCommit: string;
  result: "pass";
  completedAt: string;
  notes?: string;
};

function fail(message: string): never {
  throw new Error(`V3 live promotion failed: ${message}`);
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseActivationEvidence(
  value: unknown,
  expected: {
    kind: EvidenceKind;
    candidateSuiteReleaseId: `sha256:${string}`;
    sourceCommit: string;
  },
): V3ActivationEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${expected.kind} evidence is not an object.`);
  const evidence = value as Record<string, unknown>;
  const allowed = new Set([
    "schema", "kind", "chainId", "candidateSuiteReleaseId", "sourceCommit", "result", "completedAt", "notes",
  ]);
  if (Object.keys(evidence).some((key) => !allowed.has(key))) fail(`${expected.kind} evidence contains an unknown field.`);
  if (
    evidence.schema !== "sepbase.v3.release-evidence.v1"
    || evidence.kind !== expected.kind
    || evidence.chainId !== 84_532
    || evidence.candidateSuiteReleaseId !== expected.candidateSuiteReleaseId
    || evidence.sourceCommit !== expected.sourceCommit
    || evidence.result !== "pass"
    || typeof evidence.completedAt !== "string"
    || Number.isNaN(Date.parse(evidence.completedAt))
    || (evidence.notes !== undefined && (typeof evidence.notes !== "string" || evidence.notes.length > 2_000))
  ) fail(`${expected.kind} evidence does not match the reviewed candidate release.`);
  return evidence as V3ActivationEvidence;
}

function assertCleanCommit(root: string, expectedCommit: string) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", shell: false });
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (
    !/^[a-f0-9]{40}$/.test(expectedCommit)
    || head.status !== 0
    || status.status !== 0
    || head.stdout.trim() !== expectedCommit
    || status.stdout.trim() !== ""
  ) fail("SOURCE_COMMIT must equal a clean reviewed git HEAD.");
}

async function readEvidence(
  root: string,
  candidate: V3SuiteManifest,
  sourceCommit: string,
) {
  const records = [] as Array<{ kind: EvidenceKind; path: string; sha256: string; evidence: V3ActivationEvidence }>;
  for (const kind of EVIDENCE_KINDS) {
    const prefix = kind.toUpperCase().replaceAll("-", "_");
    const configuredPath = process.env[`V3_${prefix}_EVIDENCE_PATH`]?.trim();
    const expectedHash = process.env[`V3_${prefix}_EVIDENCE_SHA256`]?.trim().toLowerCase();
    if (!configuredPath || !expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      fail(`V3_${prefix}_EVIDENCE_PATH and V3_${prefix}_EVIDENCE_SHA256 are required.`);
    }
    const path = resolve(root, configuredPath);
    const workspaceRelative = relative(root, path);
    if (workspaceRelative.startsWith("..") || resolve(root, workspaceRelative) !== path) {
      fail(`${kind} evidence must be inside the release workspace.`);
    }
    const bytes = await readFile(path);
    if (sha256(bytes) !== expectedHash) fail(`${kind} evidence SHA-256 differs from the reviewed value.`);
    const evidence = parseActivationEvidence(JSON.parse(bytes.toString("utf8")) as unknown, {
      kind,
      candidateSuiteReleaseId: candidate.suiteReleaseId,
      sourceCommit,
    });
    records.push({ kind, path: workspaceRelative.replaceAll("\\", "/"), sha256: expectedHash, evidence });
  }
  return records;
}

function localFetcher(root: string, manifest: V3SuiteManifest): typeof fetch {
  const paths = new Map(V3_SUITE_MODULE_KEYS.map((key) => [
    manifest.contracts[key].abiUrl,
    resolve(root, `apps/web/public${manifest.contracts[key].abiUrl}`),
  ]));
  return async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.pathname === "/deployment-manifest.v3.json") {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const path = paths.get(url.pathname);
    return path
      ? new Response(await readFile(path), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response("Not found", { status: 404 });
  };
}

export async function promoteV3Live(options: {
  root?: string;
  manifestPath?: string;
  rpcUrl: string;
  sourceCommit: string;
  write: boolean;
}) {
  const root = resolve(options.root ?? process.cwd());
  const manifestPath = resolve(options.manifestPath ?? resolve(root, "apps/web/public/deployment-manifest.v3.json"));
  const rpc = new URL(options.rpcUrl);
  if (rpc.protocol !== "https:" || rpc.username || rpc.password || rpc.hash) fail("RPC_URL must be a server-only HTTPS URL without userinfo or fragment.");
  assertCleanCommit(root, options.sourceCommit);
  const original = await readFile(manifestPath);
  const candidate = parseV3SuiteManifest(JSON.parse(original.toString("utf8")) as unknown);
  if (candidate.releaseStatus !== "candidate") fail("only a verified candidate manifest can become live.");
  if (candidate.gitCommit !== options.sourceCommit) fail("candidate gitCommit differs from SOURCE_COMMIT.");
  if (process.env.V3_PAID_X402_ENABLED?.trim() !== "true") fail("V3_PAID_X402_ENABLED must be explicitly true.");
  const evidence = await readEvidence(root, candidate, options.sourceCommit);

  const live = structuredClone(candidate);
  live.releaseStatus = "live";
  live.capabilities.paidX402 = true;
  live.x402.paidExecutionAvailable = true;
  live.suiteReleaseId = await calculateV3SuiteReleaseId(live);
  const parsedLive = parseV3SuiteManifest(live);
  const readiness = x402RegistrationReadiness(
    v3X402DeploymentProfile(parsedLive),
    process.env,
    COMPILED_X402_RUNTIME_CAPABILITIES,
  );
  if (!readiness.ready) {
    fail(`paid x402 readiness blockers remain: ${readiness.blockers.map((item) => item.code).join(", ")}`);
  }
  const adapterOrigin = "https://v3-live-promotion.invalid";
  const context = await createV3SuiteContext({
    manifestUrl: `${adapterOrigin}/deployment-manifest.v3.json`,
    rpcUrl: rpc.href,
    fetcher: localFetcher(root, parsedLive),
    allowedManifestOrigins: [adapterOrigin],
    allowedRpcOrigins: [rpc.origin],
  });
  if (context.manifest.suiteReleaseId !== parsedLive.suiteReleaseId) fail("SDK verification returned another live release identity.");
  if (!options.write) return { live: parsedLive, evidence, written: false as const };

  const unchanged = await readFile(manifestPath);
  if (sha256(unchanged) !== sha256(original)) fail("candidate manifest changed during live promotion.");
  const activationRecord = {
    schema: "sepbase.v3.live-activation.v1",
    chainId: parsedLive.chainId,
    candidateSuiteReleaseId: candidate.suiteReleaseId,
    liveSuiteReleaseId: parsedLive.suiteReleaseId,
    sourceCommit: options.sourceCommit,
    activatedAt: new Date().toISOString(),
    evidence: evidence.map(({ kind, path, sha256: hash }) => ({ kind, path, sha256: hash })),
  };
  const temporary = `${manifestPath}.live-${process.pid}.tmp`;
  const recordPath = resolve(root, `evidence/v3-release/live-${parsedLive.suiteReleaseId.slice(7)}.json`);
  await mkdir(dirname(recordPath), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(parsedLive, null, 2)}\n`, "utf8");
  await writeFile(recordPath, `${JSON.stringify(activationRecord, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, manifestPath);
  } catch (error) {
    await rm(recordPath, { force: true });
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  return { live: parsedLive, evidence, written: true as const, recordPath };
}

if (isMainModule(import.meta.url)) {
  const rpcUrl = process.env.RPC_URL?.trim();
  const sourceCommit = process.env.SOURCE_COMMIT?.trim();
  if (!rpcUrl || !sourceCommit) {
    console.error("V3 live promotion failed closed. RPC_URL and SOURCE_COMMIT are required.");
    process.exitCode = 1;
  } else {
    try {
      const result = await promoteV3Live({
        rpcUrl,
        sourceCommit,
        write: process.env.V3_LIVE_ACTIVATION_WRITE?.trim() === "true",
      });
      console.log(result.written
        ? `Promoted V3 live release ${result.live.suiteReleaseId}. Regenerate discovery and run hosted live smoke.`
        : `V3 live promotion preflight passed for ${result.live.suiteReleaseId}; set V3_LIVE_ACTIVATION_WRITE=true to write.`);
    } catch {
      console.error("V3 live promotion failed closed. No live manifest was written.");
      process.exitCode = 1;
    }
  }
}
