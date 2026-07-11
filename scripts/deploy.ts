import "./lib/load-env";
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, getAddress, http } from "viem";
import { projectConfig } from "../apps/web/config/project.config";
import { checkChain } from "./chain-check";
import { checkDeployment } from "./deployment-check";
import { exportAbi } from "./export-abi";
import { generateManifest } from "./generate-manifest";
import { resolveForgeExecutable } from "./lib/foundry";
import { getVerifierConfig } from "./lib/verifier";
import { syncDeploymentRecord } from "./sync-deployment";
import { packShortNamePriceMultipliers } from "../apps/web/lib/pricing";

if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required for deployment.");
if (!process.env.OWNER_ADDRESS) throw new Error("OWNER_ADDRESS is required for deployment.");
if (!process.env.TREASURY_ADDRESS) throw new Error("TREASURY_ADDRESS is required for deployment.");

await checkChain();

const contractsRoot = resolve(process.cwd(), "contracts");

function runForge(
  args: string[],
  label: string,
  environment = process.env,
  cwd = process.cwd(),
) {
  const result = spawnSync(resolveForgeExecutable(), args, {
    cwd,
    env: environment,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status}.`);
}

const targetContractVersion = "2.0.0";

type DeploymentRecord = {
  contract?: string;
  contractVersion?: string;
  transactionHash?: string;
};

async function ensureNoLiveDeployment(): Promise<void> {
  const deploymentPath = resolve(process.cwd(), `deployments/${projectConfig.chain.id}.json`);
  try {
    await access(deploymentPath);
    const deployment = JSON.parse(await readFile(deploymentPath, "utf8")) as DeploymentRecord;
    if (!deployment.contract) return;
    const address = getAddress(deployment.contract);
    const client = createPublicClient({ transport: http(projectConfig.chain.rpcUrl, { timeout: 10_000 }) });
    const bytecode = await client.getBytecode({ address });
    if (bytecode && bytecode !== "0x") {
      if (!deployment.contractVersion) {
        throw new Error(`Live deployment ${address} has no contractVersion. Refusing to replace an unversioned record.`);
      }
      if (deployment.contractVersion === targetContractVersion) {
        throw new Error(`ChainNameService ${targetContractVersion} is already deployed at ${address}. Refusing to redeploy.`);
      }
      const archivePath = resolve(
        process.cwd(),
        `deployments/${projectConfig.chain.id}-v${deployment.contractVersion}.json`,
      );
      let archive: DeploymentRecord;
      try {
        archive = JSON.parse(await readFile(archivePath, "utf8")) as DeploymentRecord;
      } catch {
        throw new Error(`Archive ${archivePath} is required before replacing live deployment ${address}.`);
      }
      if (
        !archive.contract
        || getAddress(archive.contract) !== address
        || archive.contractVersion !== deployment.contractVersion
        || archive.transactionHash !== deployment.transactionHash
      ) {
        throw new Error(`Archive ${archivePath} does not exactly preserve the current live deployment.`);
      }
      if (process.env.ALLOW_VERSION_REDEPLOY !== "true") {
        throw new Error(
          `Live ${deployment.contractVersion} deployment ${address} is archived. `
          + `Set ALLOW_VERSION_REDEPLOY=true for this command to publish ${targetContractVersion}.`,
        );
      }
      console.warn(
        `Publishing ${targetContractVersion}; archived ${deployment.contractVersion} remains live at ${address}.`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

await ensureNoLiveDeployment();

runForge(["build"], "Foundry build", process.env, contractsRoot);
runForge(["test", "-vvv"], "Foundry tests", process.env, contractsRoot);

const environment = {
  ...process.env,
  COLLECTION_NAME: projectConfig.collection.name,
  COLLECTION_SYMBOL: projectConfig.collection.symbol,
  NAME_SUFFIX: projectConfig.brand.suffix,
  GRACE_PERIOD_SECONDS: String(projectConfig.names.gracePeriodDays * 86_400),
  SETTLEMENT_KIND: projectConfig.settlement.kind,
  SETTLEMENT_TOKEN_ADDRESS: projectConfig.settlement.tokenAddress ?? "0x0000000000000000000000000000000000000000",
  ANNUAL_PRICE_BASE_UNITS: (await import("viem")).parseUnits(
    projectConfig.pricing.annual,
    projectConfig.settlement.decimals,
  ).toString(),
  SHORT_NAME_PRICE_MULTIPLIERS: String(
    packShortNamePriceMultipliers(projectConfig.pricing.shortNameMultipliers),
  ),
  REFERRAL_REWARD_BPS: String(projectConfig.referrals.rewardBps),
  MARKETPLACE_FEE_BPS: String(projectConfig.marketplace.feeBps),
  METADATA_BASE_URI: new URL(projectConfig.integration.metadataPath, projectConfig.siteUrl).href,
};

const args = [
  "script",
  "script/Deploy.s.sol:Deploy",
  "--rpc-url",
  projectConfig.chain.rpcUrl,
  "--chain",
  String(projectConfig.chain.id),
  "--broadcast",
  "--slow",
];
const verifierConfig = getVerifierConfig(projectConfig.chain.id);
const { verifier } = verifierConfig;
if (verifier !== "none") {
  args.push("--verify", "--verifier", verifier);
  if (verifierConfig.url) args.push("--verifier-url", verifierConfig.url);
  if (verifierConfig.apiKey) args.push("--etherscan-api-key", verifierConfig.apiKey);
}
runForge(args, "Foundry deployment", environment, contractsRoot);

await syncDeploymentRecord();
await exportAbi();
await generateManifest();
await checkDeployment();
console.log("Deployment, ABI export, and manifest generation completed.");
