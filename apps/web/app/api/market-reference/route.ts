import { z } from "zod";
import { projectConfig } from "@/config/project.config";
import { apiError, apiJson, OPTIONS } from "@/lib/api-response";

export { OPTIONS };

const coinbaseSpotSchema = z.object({
  data: z.object({
    amount: z.string()
      .min(1)
      .max(100)
      .regex(/^\d+(?:\.\d+)?$/)
      .refine((value) => /[1-9]/.test(value)),
    base: z.string().optional(),
    currency: z.string(),
  }).strict(),
}).strict();

export async function GET() {
  const reference = projectConfig.pricing.marketReference;
  if (!reference) {
    return apiError(404, "MARKET_REFERENCE_DISABLED", "No market reference is configured for this deployment.");
  }

  try {
    const pair = `${reference.asset}-${reference.currency}`;
    const response = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(pair)}/spot`, {
      headers: { Accept: "application/json" },
      next: { revalidate: reference.cacheSeconds },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Market reference provider returned ${response.status}.`);

    const parsed = coinbaseSpotSchema.safeParse(await response.json());
    if (
      !parsed.success
      || parsed.data.data.currency !== reference.currency
      || (parsed.data.data.base !== undefined && parsed.data.data.base !== reference.asset)
    ) {
      throw new Error("Market reference provider returned an invalid quote.");
    }

    return apiJson({
      data: {
        asset: reference.asset,
        currency: reference.currency,
        price: parsed.data.data.amount,
        provider: "Coinbase",
        asOf: new Date().toISOString(),
      },
    }, {
      headers: {
        "Cache-Control": `public, s-maxage=${reference.cacheSeconds}, stale-while-revalidate=${reference.cacheSeconds * 5}`,
      },
    });
  } catch {
    return apiError(503, "MARKET_REFERENCE_UNAVAILABLE", "The optional market reference is temporarily unavailable.");
  }
}
