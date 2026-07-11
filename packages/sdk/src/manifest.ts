import { getAddress } from "viem";
import { z } from "zod";
import { ManifestMismatchError, SepbaseError, UnsupportedSchemaError } from "./errors";
import type { ChainNameManifest } from "./types";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform((value) => getAddress(value));
const decimalUint = z.string().regex(/^\d{1,78}$/);
const routePath = z.string()
  .startsWith("/")
  .refine((value) => !value.includes("..") && !/[?#]/.test(value));
const manifestSchema = z.object({
  schemaVersion: z.literal(3),
  contractVersion: z.literal("2.0.0"),
  abiSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  chainId: z.number().int().positive(),
  chainName: z.string(),
  testnet: z.boolean(),
  requiredConfirmations: z.number().int().positive(),
  nativeCurrency: z.object({ name: z.string(), symbol: z.string(), decimals: z.number().int() }),
  multicall3: z.object({
    address,
    blockCreated: z.number().int().nonnegative(),
  }),
  suffix: z.string().regex(/^[a-z0-9]{1,16}$/),
  nameRules: z.object({
    minLength: z.number().int().positive(),
    maxLength: z.number().int().positive(),
    allowedYears: z.array(z.number().int().positive()).min(1),
  }),
  collection: z.object({ name: z.string(), symbol: z.string() }),
  contract: address.nullable(),
  deploymentBlock: decimalUint.nullable(),
  deployedAt: z.string().datetime().nullable(),
  owner: address.nullable(),
  treasury: address.nullable(),
  settlement: z.object({
    kind: z.enum(["native", "erc20"]),
    tokenAddress: address.nullable(),
    name: z.string(),
    symbol: z.string(),
    decimals: z.number().int().min(0).max(36),
  }),
  annualPriceBaseUnits: decimalUint,
  shortNamePriceMultipliers: z.tuple([
    z.number().int().min(1).max(255),
    z.number().int().min(1).max(255),
    z.number().int().min(1).max(255),
  ]),
  referenceFiat: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: z.string().min(1).max(100).regex(/^\d+(?:\.\d+)?$/).refine((value) => Number(value) > 0),
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
      (value) => Number.isFinite(Date.parse(`${value}T00:00:00Z`)),
    ),
    maxAgeDays: z.number().int().min(1).max(365),
  }).strict().nullable(),
  gracePeriodSeconds: decimalUint,
  referralRewardBps: z.number().int().min(0).max(2000),
  referralAttributionSeconds: decimalUint,
  marketplaceFeeBps: z.number().int().min(0).max(500),
  metadataBaseURI: z.string().url(),
  rpcUrl: z.string().url(),
  explorerUrl: z.string().url(),
  abiUrl: routePath,
  docsUrl: routePath,
  nameApiUrl: routePath,
  resolveApiUrl: routePath,
  reverseApiUrl: routePath,
  marketApiUrl: routePath,
  openApiUrl: routePath,
  solidityVersion: z.string(),
  openzeppelinVersion: z.string(),
  gitCommit: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
}).strict().superRefine((manifest, context) => {
  const issue = (path: Array<string | number>, message: string) => context.addIssue({
    code: "custom",
    path,
    message,
  });
  if (
    manifest.nameRules.minLength !== 1
    || manifest.nameRules.maxLength !== 32
    || manifest.nameRules.allowedYears.join(",") !== "1,2,3,4,5"
  ) issue(["nameRules"], "Contract 2.0.0 requires labels 1-32 and years 1-5.");
  const [one, two, three] = manifest.shortNamePriceMultipliers;
  if (one < two || two < three) {
    issue(["shortNamePriceMultipliers"], "Short-name multipliers must descend from one to three characters.");
  }
  const annualPrice = BigInt(manifest.annualPriceBaseUnits);
  if (annualPrice === 0n) {
    issue(["annualPriceBaseUnits"], "Annual price must be positive.");
  } else if (annualPrice > ((1n << 256n) - 1n) / (BigInt(one) * 5n)) {
    issue(["annualPriceBaseUnits"], "Annual price exceeds the premium quote contract bound.");
  }
  if (manifest.settlement.kind === "native") {
    if (manifest.settlement.tokenAddress !== null) {
      issue(["settlement", "tokenAddress"], "Native settlement cannot declare a token address.");
    }
    if (
      manifest.settlement.name !== manifest.nativeCurrency.name
      || manifest.settlement.symbol !== manifest.nativeCurrency.symbol
      || manifest.settlement.decimals !== manifest.nativeCurrency.decimals
    ) issue(["settlement"], "Native settlement metadata must match the native gas currency.");
  } else if (manifest.settlement.tokenAddress === null) {
    issue(["settlement", "tokenAddress"], "ERC-20 settlement requires a token address.");
  }
  if (manifest.testnet && manifest.referenceFiat !== null) {
    issue(["referenceFiat"], "Testnet manifests cannot publish a fiat reference.");
  }
  const deploymentFields = [manifest.deploymentBlock, manifest.deployedAt, manifest.owner, manifest.treasury];
  if (manifest.contract === null && deploymentFields.some((value) => value !== null)) {
    issue(["contract"], "Pre-deployment manifests must keep deployment identity fields null.");
  }
  if (manifest.contract !== null && deploymentFields.some((value) => value === null)) {
    issue(["contract"], "Published deployments require block, timestamp, owner, and treasury.");
  }
});

export function parseManifest(value: unknown): ChainNameManifest {
  const schemaVersion = typeof value === "object" && value !== null && "schemaVersion" in value
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : undefined;
  if (schemaVersion !== 3) throw new UnsupportedSchemaError(schemaVersion);
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new ManifestMismatchError(`Manifest validation failed: ${parsed.error.issues[0]?.message ?? "unknown schema error"}`);
  }
  return parsed.data as ChainNameManifest;
}

export async function loadManifest(
  manifestUrl: string | URL,
  fetcher: typeof fetch = fetch,
): Promise<{ manifest: ChainNameManifest; origin: URL }> {
  const url = new URL(manifestUrl);
  let response: Response;
  try {
    response = await fetcher(url);
  } catch {
    throw new SepbaseError("Manifest request failed.", "MANIFEST_UNAVAILABLE", 503);
  }
  if (!response.ok) {
    throw new SepbaseError(
      `Manifest request failed with HTTP ${response.status}.`,
      "MANIFEST_UNAVAILABLE",
      response.status,
    );
  }
  return { manifest: parseManifest(await response.json()), origin: url };
}

export function resolveManifestUrl(path: string, manifestUrl: URL): URL {
  return new URL(path, manifestUrl);
}
