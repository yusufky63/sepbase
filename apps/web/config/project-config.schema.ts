import { z } from "zod";
import { isSafeOriginRelativePath } from "../lib/safe-route-path";

const utf8Text = (maxBytes: number) => z.string()
  .min(1)
  .refine((value) => new TextEncoder().encode(value).length <= maxBytes, `Must be at most ${maxBytes} UTF-8 bytes.`)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Control characters are not allowed.");

const assetSchema = z
  .object({
    name: utf8Text(64),
    symbol: utf8Text(16),
    decimals: z.number().int().min(0).max(36),
  })
  .strict();

const settlementSchema = z.discriminatedUnion("kind", [
  assetSchema
    .extend({
      kind: z.literal("native"),
      tokenAddress: z.null(),
    })
    .strict(),
  assetSchema
    .extend({
      kind: z.literal("erc20"),
      tokenAddress: z.string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .refine((value) => !/^0x0{40}$/i.test(value), "Settlement token cannot be the zero address."),
    })
    .strict(),
]);

const routePath = z
  .string()
  .refine(isSafeOriginRelativePath, "Must be a safe same-origin path without traversal.");

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const feeEstimationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("standard") }).strict(),
  z.object({
    kind: z.literal("op-stack"),
    gasPriceOracleAddress: addressSchema,
    l1BlockAddress: addressSchema,
  }).strict(),
]);

const fiatReferenceSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: z.string().min(1).max(100).regex(/^\d+(?:\.\d+)?$/).refine((value) => Number(value) > 0),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && timestamp <= Date.now();
  }, "Fiat reference date must be a valid, non-future UTC date."),
  maxAgeDays: z.number().int().min(1).max(365),
}).strict();

const marketReferenceSchema = z.object({
  provider: z.literal("coinbase"),
  asset: z.string().regex(/^[A-Z0-9]{2,16}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  cacheSeconds: z.number().int().min(30).max(3600),
}).strict();

export const projectConfigSchema = z
  .object({
    brand: z
      .object({
        name: z.string().min(1).max(64),
        shortName: z.string().min(1).max(32),
        suffix: z.string().regex(/^[a-z0-9]{1,16}$/),
        motto: z.string().min(1).max(120),
        description: z.string().min(1).max(240),
        theme: z.literal("contrast"),
        accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
        logo: routePath,
        mark: routePath,
        favicon: routePath,
      })
      .strict(),
    collection: z
      .object({
        name: utf8Text(64),
        symbol: utf8Text(16),
      })
      .strict(),
    chain: z
      .object({
        id: z.number().int().positive().safe(),
        name: z.string().min(1),
        testnet: z.boolean(),
        requiredConfirmations: z.number().int().min(1).max(100),
        rpcUrl: z.string().url(),
        explorerUrl: z.string().url(),
        nativeCurrency: assetSchema,
        feeEstimation: feeEstimationSchema,
        multicall3: z.object({
          address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
          blockCreated: z.number().int().nonnegative().safe(),
        }).strict(),
      })
      .strict(),
    settlement: settlementSchema,
    names: z
      .object({
        minLength: z.literal(1),
        maxLength: z.literal(32),
        allowedYears: z.tuple([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
        ]),
        gracePeriodDays: z.number().int().min(1).max(90),
      })
      .strict(),
    pricing: z
      .object({
        annual: z.string().min(1).max(100).regex(/^\d+(?:\.\d+)?$/),
        shortNameMultipliers: z.tuple([
          z.number().int().min(1).max(255),
          z.number().int().min(1).max(255),
          z.number().int().min(1).max(255),
        ]),
        referenceFiat: z.union([z.null(), fiatReferenceSchema]),
        marketReference: z.union([z.null(), marketReferenceSchema]),
      })
      .strict(),
    referrals: z
      .object({
        rewardBps: z.number().int().min(0).max(2000),
        attributionDays: z.number().int().min(1).max(90),
      })
      .strict(),
    marketplace: z
      .object({
        feeBps: z.number().int().min(0).max(500),
        listingsPerPage: z.number().int().min(1).max(50),
      })
      .strict(),
    admin: z
      .object({
        path: routePath,
        viewerAddresses: z.array(addressSchema).max(20),
        logBlockRange: z.number().int().min(1_000).max(100_000),
        activityPageSize: z.number().int().min(10).max(100),
      })
      .strict(),
    integration: z
      .object({
        docsPath: routePath,
        metadataPath: routePath,
        imagePath: routePath,
        nameApiPath: routePath,
        resolveApiPath: routePath,
        reverseApiPath: routePath,
        wellKnownPath: routePath,
        marketApiPath: routePath,
        openApiPath: routePath,
        agentManifestPath: routePath,
        mcpPath: routePath,
        x402QuotePath: routePath,
        x402RegisterPath: routePath,
      })
      .strict(),
    siteUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return url.pathname === "/" && !url.search && !url.hash;
      }),
    links: z
      .object({
        website: z.string(),
        x: z.string(),
        discord: z.string(),
      })
      .strict(),
  })
  .strict()
  .superRefine((config, context) => {
    const issue = (path: Array<string | number>, message: string) => context.addIssue({
      code: "custom",
      path,
      message,
    });
    if (config.settlement.kind === "native") {
      const native = config.chain.nativeCurrency;
      if (
        config.settlement.name !== native.name
        || config.settlement.symbol !== native.symbol
        || config.settlement.decimals !== native.decimals
      ) issue(["settlement"], "Native settlement metadata must match the chain native currency.");
    }
    if (config.chain.testnet && config.pricing.referenceFiat !== null) {
      issue(["pricing", "referenceFiat"], "Testnet profiles cannot publish a fiat reference.");
    }
    if (
      config.pricing.marketReference
      && config.pricing.marketReference.asset !== config.settlement.symbol
    ) {
      issue(["pricing", "marketReference", "asset"], "Market reference asset must match the settlement symbol.");
    }
    const [whole, fraction = ""] = config.pricing.annual.split(".");
    const [oneCharacterMultiplier, twoCharacterMultiplier, threeCharacterMultiplier] = config.pricing.shortNameMultipliers;
    if (
      oneCharacterMultiplier < twoCharacterMultiplier
      || twoCharacterMultiplier < threeCharacterMultiplier
    ) {
      issue(["pricing", "shortNameMultipliers"], "Short-name multipliers must descend from one to three characters.");
    }
    if (fraction.length > config.settlement.decimals) {
      issue(["pricing", "annual"], "Annual price has more precision than the settlement asset supports.");
    } else {
      const scale = 10n ** BigInt(config.settlement.decimals);
      const baseUnits = BigInt(whole ?? "0") * scale + BigInt((fraction || "0").padEnd(config.settlement.decimals, "0"));
      if (baseUnits === 0n) issue(["pricing", "annual"], "Annual price must be positive in base units.");
      const maxQuoteMultiplier = BigInt(oneCharacterMultiplier) * 5n;
      if (baseUnits > ((1n << 256n) - 1n) / maxQuoteMultiplier) {
        issue(["pricing", "annual"], "Annual price exceeds the premium quote contract bound.");
      }
    }
    const integrations: Array<[keyof typeof config.integration, string]> = [
      ["nameApiPath", "{label}"],
      ["resolveApiPath", "{label}"],
      ["reverseApiPath", "{address}"],
    ];
    for (const [field, placeholder] of integrations) {
      const path = config.integration[field];
      if (path.split(placeholder).length !== 2 || /\{[^}]+\}/.test(path.replace(placeholder, ""))) {
        issue(["integration", field], `Path must contain exactly one ${placeholder} placeholder.`);
      }
    }
    if (!config.integration.metadataPath.endsWith("/")) issue(["integration", "metadataPath"], "Metadata path must end with /.");
    if (!config.integration.imagePath.endsWith("/")) issue(["integration", "imagePath"], "Image path must end with /.");
    const normalizedAdminViewers = config.admin.viewerAddresses.map((value) => value.toLowerCase());
    if (new Set(normalizedAdminViewers).size !== normalizedAdminViewers.length) {
      issue(["admin", "viewerAddresses"], "Admin viewer addresses must be unique.");
    }
    const site = new URL(config.siteUrl);
    if (!config.chain.testnet && site.protocol !== "https:") issue(["siteUrl"], "Production site URL must use HTTPS.");
    for (const field of ["rpcUrl", "explorerUrl"] as const) {
      if (!config.chain.testnet && new URL(config.chain[field]).protocol !== "https:") {
        issue(["chain", field], "Production chain URLs must use HTTPS.");
      }
    }
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
