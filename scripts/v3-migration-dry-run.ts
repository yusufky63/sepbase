import "./lib/load-env";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { chainNameServiceAbi } from "../apps/web/lib/contract/abi.generated";
import { parseManifest } from "../packages/sdk/src/manifest";
import {
  normalizeName,
  SEPBASE_NORMALIZATION,
} from "../packages/sdk/src/normalization";
import { isMainModule } from "./lib/is-main";

const PAGE_SIZE = 100;
const DETAIL_CALLS_PER_TOKEN = 5;
const V3_NAME_LIMITS = {
  minCodePoints: 1,
  maxCodePoints: 32,
  maxUtf8Bytes: 96,
} as const;

type LegacyStatus = "active" | "grace" | "released";

export type V3MigrationDryRunRecord = {
  label: string;
  fullName: string;
  tokenId: string;
  labelHash: Hex;
  v3Node: Hex;
  owner: Address;
  resolvedAddress: Address;
  status: Exclude<LegacyStatus, "released">;
  expiresAt: string;
};

type RawLegacyRecord = {
  tokenId: bigint;
  fullName: string;
  owner: Address;
  status: number;
  expiresAt: bigint;
  resolvedAddress: Address;
};

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredSourceBlock() {
  const value = process.env.V3_MIGRATION_SOURCE_BLOCK?.trim();
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(
      "V3_MIGRATION_SOURCE_BLOCK must be an explicit positive decimal block; latest-head snapshots are not reproducible.",
    );
  }
  return BigInt(value);
}

function legacyStatus(value: number): LegacyStatus {
  if (value === 1) return "active";
  if (value === 2) return "grace";
  if (value === 3) return "released";
  throw new Error(`Unexpected legacy lifecycle value ${value}.`);
}

export function canonicalMigrationRecord(
  raw: RawLegacyRecord,
  suffix: string,
): V3MigrationDryRunRecord | null {
  const status = legacyStatus(raw.status);
  if (status === "released") return null;

  const suffixWithDot = `.${suffix}`;
  if (!raw.fullName.endsWith(suffixWithDot)) {
    throw new Error(`Legacy token ${raw.tokenId} has a full name outside .${suffix}.`);
  }
  const label = raw.fullName.slice(0, -suffixWithDot.length);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) {
    throw new Error(`Legacy token ${raw.tokenId} does not use the canonical V2 ASCII grammar.`);
  }
  const normalized = normalizeName(label, suffix, V3_NAME_LIMITS);
  if (
    normalized.normalizedLabel !== label
    || normalized.normalizedFullName !== raw.fullName
    || normalized.tokenId !== raw.tokenId
  ) {
    throw new Error(`Legacy token ${raw.tokenId} does not map exactly to one V3 canonical identity.`);
  }
  if (raw.expiresAt === 0n) {
    throw new Error(`Eligible legacy token ${raw.tokenId} has no expiry.`);
  }
  return {
    label,
    fullName: raw.fullName,
    tokenId: raw.tokenId.toString(),
    labelHash: normalized.labelHash,
    v3Node: normalized.node,
    owner: getAddress(raw.owner),
    resolvedAddress: getAddress(raw.resolvedAddress),
    status,
    expiresAt: raw.expiresAt.toString(),
  };
}

function checkedOutputPath(root: string, configured: string) {
  const output = resolve(root, configured);
  const workspacePrefix = `${root}${sep}`.toLowerCase();
  if (!output.toLowerCase().startsWith(workspacePrefix)) {
    throw new Error("V3_MIGRATION_REPORT_PATH must remain inside the repository workspace.");
  }
  return output;
}

export async function runV3MigrationDryRun() {
  const root = process.cwd();
  const manifestBytes = await readFile(
    resolve(root, "apps/web/public/deployment-manifest.json"),
  );
  const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")) as unknown);
  if (!manifest.contract) throw new Error("The live V2 deployment manifest has no contract address.");

  const sourceBlock = requiredSourceBlock();
  const rpcUrl = process.env.RPC_URL?.trim() || manifest.rpcUrl;
  const rpc = new URL(rpcUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(rpc.hostname);
  if (rpc.username || rpc.password || (rpc.protocol !== "https:" && !(rpc.protocol === "http:" && loopback))) {
    throw new Error("Migration RPC must be credential-free HTTPS or a loopback development URL.");
  }

  const chain = defineChain({
    id: manifest.chainId,
    name: manifest.chainName,
    nativeCurrency: manifest.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: manifest.explorerUrl } },
    testnet: manifest.testnet,
  });
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { fetchOptions: { redirect: "error" }, timeout: 30_000 }),
  });
  const [chainId, latestBlock] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
  ]);
  if (chainId !== manifest.chainId) throw new Error("Migration RPC chain ID differs from the V2 manifest.");
  if (sourceBlock > latestBlock) throw new Error("Migration source block is above the current RPC head.");

  const source = await client.getBlock({ blockNumber: sourceBlock });
  const totalSupply = await client.readContract({
    address: manifest.contract,
    abi: chainNameServiceAbi,
    functionName: "totalSupply",
    blockNumber: sourceBlock,
  });

  const tokenIds: bigint[] = [];
  for (let offset = 0n; offset < totalSupply; offset += BigInt(PAGE_SIZE)) {
    const count = Number(
      totalSupply - offset > BigInt(PAGE_SIZE)
        ? BigInt(PAGE_SIZE)
        : totalSupply - offset,
    );
    const page = await client.multicall({
      allowFailure: false,
      blockNumber: sourceBlock,
      multicallAddress: manifest.multicall3.address,
      contracts: Array.from({ length: count }, (_, index) => ({
        address: manifest.contract as Address,
        abi: chainNameServiceAbi,
        functionName: "tokenByIndex" as const,
        args: [offset + BigInt(index)] as const,
      })),
    });
    tokenIds.push(...page);
  }

  const records: V3MigrationDryRunRecord[] = [];
  const counts = { active: 0, grace: 0, released: 0 };
  for (let offset = 0; offset < tokenIds.length; offset += PAGE_SIZE) {
    const page = tokenIds.slice(offset, offset + PAGE_SIZE);
    const calls = page.flatMap((tokenId) => [
      { address: manifest.contract as Address, abi: chainNameServiceAbi, functionName: "fullName" as const, args: [tokenId] as const },
      { address: manifest.contract as Address, abi: chainNameServiceAbi, functionName: "ownerOf" as const, args: [tokenId] as const },
      { address: manifest.contract as Address, abi: chainNameServiceAbi, functionName: "statusOf" as const, args: [tokenId] as const },
      { address: manifest.contract as Address, abi: chainNameServiceAbi, functionName: "expiresAt" as const, args: [tokenId] as const },
      { address: manifest.contract as Address, abi: chainNameServiceAbi, functionName: "resolvedAddress" as const, args: [tokenId] as const },
    ]);
    const values = await client.multicall({
      allowFailure: false,
      blockNumber: sourceBlock,
      multicallAddress: manifest.multicall3.address,
      contracts: calls,
    });
    for (let index = 0; index < page.length; index += 1) {
      const base = index * DETAIL_CALLS_PER_TOKEN;
      const raw = {
        tokenId: page[index]!,
        fullName: values[base] as string,
        owner: values[base + 1] as Address,
        status: values[base + 2] as number,
        expiresAt: values[base + 3] as bigint,
        resolvedAddress: values[base + 4] as Address,
      };
      const status = legacyStatus(raw.status);
      counts[status] += 1;
      const record = canonicalMigrationRecord(raw, manifest.suffix);
      if (record) records.push(record);
    }
  }

  records.sort((left, right) => left.label < right.label ? -1 : left.label > right.label ? 1 : 0);
  const uniqueLabels = new Set(records.map((record) => record.label));
  const uniqueNodes = new Set(records.map((record) => record.v3Node.toLowerCase()));
  if (uniqueLabels.size !== records.length || uniqueNodes.size !== records.length) {
    throw new Error("Migration dry run found a canonical label or V3 node collision.");
  }

  const fixtureBytes = await readFile(resolve(root, "fixtures/name-normalization.json"));
  const payload = {
    schema: "sepbase.v3-migration-dry-run.v1",
    proofModel: "live-onchain-read",
    source: {
      chainId: manifest.chainId,
      contract: manifest.contract,
      contractVersion: manifest.contractVersion,
      blockNumber: sourceBlock.toString(),
      blockHash: source.hash,
      blockTimestamp: source.timestamp.toString(),
    },
    target: {
      suiteVersion: "3.0.0",
      suffix: manifest.suffix,
      normalizationProfileId: SEPBASE_NORMALIZATION.profileIdentifier,
      normalizationProfileHash: SEPBASE_NORMALIZATION.profileHash,
      normalizationFixtureSha256: sha256(fixtureBytes),
    },
    summary: {
      totalEnumerated: tokenIds.length,
      eligible: records.length,
      active: counts.active,
      grace: counts.grace,
      released: counts.released,
    },
    records,
  } as const;
  const report = {
    ...payload,
    reportSha256: sha256(JSON.stringify(payload)),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const configuredOutput = process.env.V3_MIGRATION_REPORT_PATH?.trim();
  if (configuredOutput) {
    const output = checkedOutputPath(root, configuredOutput);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serialized, "utf8");
    return { report, output: relative(root, output) };
  }
  return { report, output: null };
}

if (isMainModule(import.meta.url)) {
  const result = await runV3MigrationDryRun();
  if (result.output) {
    console.log(`Wrote reproducible V3 migration dry run to ${result.output}.`);
    console.log(JSON.stringify(result.report.summary));
  } else {
    console.log(JSON.stringify(result.report, null, 2));
  }
}
