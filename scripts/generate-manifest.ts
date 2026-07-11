import "./lib/load-env";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { getAddress, parseUnits } from "viem";
import { projectConfig } from "../apps/web/config/project.config";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";
import { isMainModule } from "./lib/is-main";

type DeploymentRecord = {
  contract?: string;
  contractVersion?: string;
  deploymentBlock?: string;
  deployedAt?: string;
  deployedAtTimestamp?: string;
  owner?: string;
  treasury?: string;
};

const execFileAsync = promisify(execFile);

async function currentGitCommit(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
    const commit = stdout.trim().toLowerCase();
    return /^[a-f0-9]{40}$/.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

async function optionalDeployment(path: string): Promise<DeploymentRecord | null> {
  try {
    await access(path);
    return JSON.parse(await readFile(path, "utf8")) as DeploymentRecord;
  } catch {
    return null;
  }
}

export async function generateManifest(): Promise<void> {
  const root = process.cwd();
  const abiPath = resolve(root, "apps/web/public/abi/ChainNameService.json");
  let abiSha256: string | null = null;
  try {
    const abi = await readFile(abiPath);
    abiSha256 = createHash("sha256").update(abi).digest("hex");
  } catch {
    // A pre-deployment manifest is valid before the first contract build.
  }

  const deploymentPath = resolve(root, `deployments/${projectConfig.chain.id}.json`);
  const deployment = await optionalDeployment(deploymentPath);
  const currentDeployment = deployment?.contractVersion === "2.0.0" ? deployment : null;
  const normalized = (value: string | undefined): `0x${string}` | null =>
    value ? getAddress(value) : null;
  const annualPrice = parseUnits(projectConfig.pricing.annual, projectConfig.settlement.decimals);
  const metadataBaseURI = new URL(projectConfig.integration.metadataPath, projectConfig.siteUrl).href;
  const gitCommit = await currentGitCommit(root);
  const deployedAt = currentDeployment?.deployedAt
    ?? (currentDeployment?.deployedAtTimestamp
      ? new Date(Number(currentDeployment.deployedAtTimestamp) * 1000).toISOString()
      : null);

  const manifest = deploymentManifestSchema.parse({
    schemaVersion: 3,
    contractVersion: "2.0.0",
    abiSha256,
    chainId: projectConfig.chain.id,
    chainName: projectConfig.chain.name,
    testnet: projectConfig.chain.testnet,
    requiredConfirmations: projectConfig.chain.requiredConfirmations,
    nativeCurrency: projectConfig.chain.nativeCurrency,
    multicall3: projectConfig.chain.multicall3,
    suffix: projectConfig.brand.suffix,
    nameRules: {
      minLength: projectConfig.names.minLength,
      maxLength: projectConfig.names.maxLength,
      allowedYears: projectConfig.names.allowedYears,
    },
    collection: projectConfig.collection,
    contract: normalized(currentDeployment?.contract),
    deploymentBlock: currentDeployment?.deploymentBlock ?? null,
    deployedAt,
    owner: normalized(currentDeployment?.owner),
    treasury: normalized(currentDeployment?.treasury),
    settlement: projectConfig.settlement,
    annualPriceBaseUnits: annualPrice.toString(),
    shortNamePriceMultipliers: projectConfig.pricing.shortNameMultipliers,
    referenceFiat: projectConfig.pricing.referenceFiat,
    gracePeriodSeconds: (BigInt(projectConfig.names.gracePeriodDays) * 86_400n).toString(),
    referralRewardBps: projectConfig.referrals.rewardBps,
    referralAttributionSeconds: (BigInt(projectConfig.referrals.attributionDays) * 86_400n).toString(),
    marketplaceFeeBps: projectConfig.marketplace.feeBps,
    metadataBaseURI,
    rpcUrl: projectConfig.chain.rpcUrl,
    explorerUrl: projectConfig.chain.explorerUrl,
    abiUrl: "/abi/ChainNameService.json",
    docsUrl: projectConfig.integration.docsPath,
    nameApiUrl: projectConfig.integration.nameApiPath,
    resolveApiUrl: projectConfig.integration.resolveApiPath,
    reverseApiUrl: projectConfig.integration.reverseApiPath,
    marketApiUrl: projectConfig.integration.marketApiPath,
    openApiUrl: projectConfig.integration.openApiPath,
    solidityVersion: "0.8.36",
    openzeppelinVersion: "5.4.0",
    gitCommit,
  });

  const manifestPath = resolve(root, "apps/web/public/deployment-manifest.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const llms = `# ${projectConfig.brand.name}\n\nIndependent .${projectConfig.brand.suffix} names on ${projectConfig.chain.name}.\n\n- Docs: ${projectConfig.integration.docsPath}\n- Manifest: ${projectConfig.integration.wellKnownPath}\n- ABI: /abi/ChainNameService.json\n- OpenAPI: ${projectConfig.integration.openApiPath}\n- Contract: ${manifest.contract ?? "not deployed"}\n- Settlement: ${manifest.settlement.symbol} (${manifest.settlement.kind})\n- Short-name multipliers: ${manifest.shortNamePriceMultipliers.join("x, ")}x for 1/2/3 characters\n`;
  await writeFile(resolve(root, "apps/web/public/llms.txt"), llms, "utf8");
}

if (isMainModule(import.meta.url)) {
  await generateManifest();
  console.log("Generated deployment manifest and llms.txt.");
}
