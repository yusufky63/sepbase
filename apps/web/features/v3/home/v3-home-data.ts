import {
  assertV3VerificationBlock,
  type SepbaseV3Client,
} from "@sepbase/sdk";
import { parseAbiItem, type Address } from "viem";

export const V3_HOME_RECENT_BLOCK_WINDOW = 10_000n;
export const V3_HOME_RECENT_LIMIT = 8;
export const V3_HOME_LOG_BLOCK_RANGE = 2_000n;

const registrationCompletedEvent = parseAbiItem(
  "event RegistrationCompleted(uint256 indexed tokenId, bytes32 indexed node, address indexed recipient, address payer, uint64 expiration, uint256 amount, bytes32 resolverInitializationHash)",
);

export type V3HomeHealth = {
  blockNumber: bigint;
  nameCount: bigint;
  registrationsPaused: boolean;
  marketPaused: boolean;
  suiteSolvent: boolean;
};

export type V3HomeRecentName = {
  tokenId: bigint;
  label: string;
  fullName: string;
  owner: Address;
  registrationBlock: bigint;
};

export type V3HomeRecentNames = {
  blockNumber: bigint;
  fromBlock: bigint;
  eventCount: number;
  inspectedCount: number;
  items: V3HomeRecentName[];
};

export async function getV3HomeConfirmedBlock(client: SepbaseV3Client) {
  const latestBlock = await client.publicClient.getBlockNumber();
  const confirmationDepth = BigInt(client.manifest.requiredConfirmations - 1);
  if (latestBlock < confirmationDepth) {
    throw new Error("The V3 chain head is below the required confirmation depth.");
  }
  const blockNumber = latestBlock - confirmationDepth;
  assertV3VerificationBlock(client.manifest, blockNumber);
  return blockNumber;
}

export async function readV3HomeHealth(
  client: SepbaseV3Client,
  blockNumber: bigint,
): Promise<V3HomeHealth> {
  assertV3VerificationBlock(client.manifest, blockNumber);
  const [nameCount, registrationsPaused, marketPaused, liabilities] = await Promise.all([
    client.publicClient.readContract({
      ...client.contracts.registry,
      functionName: "totalSupply",
      blockNumber,
    }) as Promise<bigint>,
    client.publicClient.readContract({
      ...client.contracts.controller,
      functionName: "registrationsPaused",
      blockNumber,
    }) as Promise<boolean>,
    client.publicClient.readContract({
      ...client.contracts.marketplace,
      functionName: "marketPaused",
      blockNumber,
    }) as Promise<boolean>,
    client.getLiabilities(blockNumber),
  ]);

  if (liabilities.blockNumber !== blockNumber) {
    throw new Error("V3 liability reads did not use the requested block snapshot.");
  }

  return {
    blockNumber,
    nameCount,
    registrationsPaused,
    marketPaused,
    suiteSolvent: liabilities.suiteSolvent,
  };
}

export async function readV3HomeRecentNames(
  client: SepbaseV3Client,
  blockNumber: bigint,
  options: { windowBlocks?: bigint; limit?: number } = {},
): Promise<V3HomeRecentNames> {
  assertV3VerificationBlock(client.manifest, blockNumber);
  const windowBlocks = options.windowBlocks ?? V3_HOME_RECENT_BLOCK_WINDOW;
  const limit = options.limit ?? V3_HOME_RECENT_LIMIT;
  if (windowBlocks <= 0n) throw new Error("The recent registration block window must be positive.");
  if (!Number.isInteger(limit) || limit < 1 || limit > V3_HOME_RECENT_LIMIT) {
    throw new Error(`The recent registration limit must be between 1 and ${V3_HOME_RECENT_LIMIT}.`);
  }

  const deploymentBlock = BigInt(client.manifest.deployment.blockNumber ?? "0");
  const windowStart = blockNumber >= windowBlocks - 1n
    ? blockNumber - windowBlocks + 1n
    : 0n;
  const fromBlock = deploymentBlock > windowStart ? deploymentBlock : windowStart;
  let chunkStart = fromBlock;
  let chunkEnd = chunkStart + V3_HOME_LOG_BLOCK_RANGE - 1n;
  if (chunkEnd > blockNumber) chunkEnd = blockNumber;
  const logs = [...await client.publicClient.getLogs({
    address: client.contracts.controller.address,
    event: registrationCompletedEvent,
    fromBlock: chunkStart,
    toBlock: chunkEnd,
  })];
  while (chunkEnd < blockNumber) {
    chunkStart = chunkEnd + 1n;
    chunkEnd = chunkStart + V3_HOME_LOG_BLOCK_RANGE - 1n;
    if (chunkEnd > blockNumber) chunkEnd = blockNumber;
    const chunk = await client.publicClient.getLogs({
      address: client.contracts.controller.address,
      event: registrationCompletedEvent,
      fromBlock: chunkStart,
      toBlock: chunkEnd,
    });
    logs.push(...chunk);
  }

  const candidates: Array<{ tokenId: bigint; registrationBlock: bigint }> = [];
  const seen = new Set<string>();
  for (let index = logs.length - 1; index >= 0 && candidates.length < limit * 2; index -= 1) {
    const log = logs[index];
    const tokenId = log?.args.tokenId;
    const registrationBlock = log?.blockNumber;
    if (typeof tokenId !== "bigint" || typeof registrationBlock !== "bigint") continue;
    const key = tokenId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ tokenId, registrationBlock });
  }

  const inspected = await Promise.allSettled(candidates.map(async (candidate) => {
    const label = await client.publicClient.readContract({
      ...client.contracts.registry,
      functionName: "labelOf",
      args: [candidate.tokenId],
      blockNumber,
    }) as string;
    const record = await client.getNameRecord(label, blockNumber);
    if (
      record.blockNumber !== blockNumber
      || (record.status !== "active" && record.status !== "grace")
      || record.owner === null
    ) return null;
    return {
      tokenId: record.tokenId,
      label: record.label,
      fullName: record.fullName,
      owner: record.owner,
      registrationBlock: candidate.registrationBlock,
    } satisfies V3HomeRecentName;
  }));

  const items = inspected.flatMap((result) => (
    result.status === "fulfilled" && result.value !== null ? [result.value] : []
  )).slice(0, limit);

  return {
    blockNumber,
    fromBlock,
    eventCount: logs.length,
    inspectedCount: candidates.length,
    items,
  };
}
