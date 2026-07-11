import "./lib/load-env";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, getAddress, http } from "viem";
import { projectConfig } from "../apps/web/config/project.config";
import { isMainModule } from "./lib/is-main";

type BroadcastTransaction = {
  contractAddress?: string;
  contractName?: string;
  hash?: string;
};

type BroadcastFile = {
  transactions?: BroadcastTransaction[];
};

type DeploymentRecord = {
  contract?: string;
  owner?: string;
  treasury?: string;
};

function sameAddress(left: string | undefined, right: string): boolean {
  if (!left) return false;
  try {
    return getAddress(left) === right;
  } catch {
    return false;
  }
}

export async function syncDeploymentRecord(): Promise<`0x${string}`> {
  const root = process.cwd();
  const deploymentPath = resolve(root, `deployments/${projectConfig.chain.id}.json`);
  const broadcastPath = resolve(
    root,
    `contracts/broadcast/Deploy.s.sol/${projectConfig.chain.id}/run-latest.json`,
  );
  const deployment = JSON.parse(await readFile(deploymentPath, "utf8")) as DeploymentRecord;
  const broadcast = JSON.parse(await readFile(broadcastPath, "utf8")) as BroadcastFile;
  if (!deployment.contract) throw new Error("Deployment script did not write a contract address.");

  const contract = getAddress(deployment.contract);
  const createTransaction = broadcast.transactions?.find((transaction) =>
    transaction.contractName === "ChainNameService"
    || sameAddress(transaction.contractAddress, contract));
  if (!createTransaction?.hash || !/^0x[a-fA-F0-9]{64}$/.test(createTransaction.hash)) {
    throw new Error("Could not locate the ChainNameService deployment transaction.");
  }

  const client = createPublicClient({ transport: http(projectConfig.chain.rpcUrl, { timeout: 20_000 }) });
  const receipt = await client.waitForTransactionReceipt({
    hash: createTransaction.hash as `0x${string}`,
    confirmations: projectConfig.chain.requiredConfirmations,
    timeout: 120_000,
  });
  if (receipt.status !== "success" || !sameAddress(receipt.contractAddress ?? undefined, contract)) {
    throw new Error("Deployment transaction did not create the expected contract.");
  }
  const [block, bytecode] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBytecode({ address: contract }),
  ]);
  if (!bytecode || bytecode === "0x") throw new Error("Deployed contract has no runtime bytecode.");

  const record = {
    contract,
    contractVersion: "2.0.0",
    deploymentBlock: receipt.blockNumber.toString(),
    deployedAtTimestamp: block.timestamp.toString(),
    owner: getAddress(process.env.OWNER_ADDRESS ?? deployment.owner ?? ""),
    treasury: getAddress(process.env.TREASURY_ADDRESS ?? deployment.treasury ?? ""),
    transactionHash: receipt.transactionHash,
  };
  await writeFile(deploymentPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return contract;
}

if (isMainModule(import.meta.url)) {
  const contract = await syncDeploymentRecord();
  console.log(`Synchronized deployment record for ${contract}.`);
}
