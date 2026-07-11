import { SepbaseError } from "./errors";
import { z } from "zod";
import type { ApiErrorEnvelope, MarketResponse } from "./types";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const decimalUint = z.string().regex(/^\d{1,78}$/);
const settlement = z.object({
  kind: z.enum(["native", "erc20"]),
  tokenAddress: address.nullable(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().min(0).max(36),
}).strict();
const apiContext = z.object({
  contractVersion: z.literal("2.0.0"),
  chainId: z.number().int().positive(),
  chainName: z.string(),
  contract: address.nullable(),
  suffix: z.string(),
  nameRules: z.object({
    minLength: z.number().int().positive(),
    maxLength: z.number().int().positive(),
    allowedYears: z.array(z.number().int().positive()),
  }).strict(),
  settlement,
  pricing: z.object({
    standardAnnualPriceBaseUnits: decimalUint,
    shortNamePriceMultipliers: z.tuple([
      z.number().int().min(1).max(255),
      z.number().int().min(1).max(255),
      z.number().int().min(1).max(255),
    ]),
    referenceFiat: z.object({
      currency: z.string().regex(/^[A-Z]{3}$/),
      amount: z.string(),
      asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      maxAgeDays: z.number().int().positive(),
    }).strict().nullable(),
  }).strict(),
}).strict();
const marketResponse = z.object({
  items: z.array(z.object({
    tokenId: decimalUint,
    label: z.string(),
    fullName: z.string(),
    seller: address,
    priceBaseUnits: decimalUint,
    feeBps: z.number().int().min(0).max(500),
    listedAt: decimalUint,
    expiresAt: decimalUint,
    purchasable: z.boolean(),
  }).strict()),
  marketplacePaused: z.boolean(),
  solvent: z.boolean(),
  blockNumber: decimalUint,
  nextCursor: decimalUint.nullable(),
  hasMore: z.boolean(),
  scanned: z.number().int().nonnegative().max(200),
  context: apiContext,
}).strict();

export async function getMarket(
  baseUrl: string | URL,
  options: { cursor?: string; limit?: number; path?: string } = {},
  fetcher: typeof fetch = fetch,
): Promise<MarketResponse> {
  const url = new URL(options.path ?? "/api/market", baseUrl);
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  if (options.limit !== undefined) url.searchParams.set("limit", String(options.limit));
  const response = await fetcher(url);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SepbaseError("Market API returned invalid JSON.", "INVALID_RESPONSE", response.status);
  }
  if (!response.ok || (typeof body === "object" && body !== null && "error" in body)) {
    const envelope = body as Partial<ApiErrorEnvelope>;
    const error = envelope.error && typeof envelope.error.code === "string" && typeof envelope.error.message === "string"
      ? envelope.error
      : { code: "MARKET_UNAVAILABLE", message: "Market unavailable." };
    throw new SepbaseError(error.message, error.code, response.status);
  }
  const parsed = marketResponse.safeParse(body);
  if (!parsed.success) {
    throw new SepbaseError("Market API response does not match the published schema.", "INVALID_RESPONSE", 502);
  }
  return parsed.data as MarketResponse;
}
