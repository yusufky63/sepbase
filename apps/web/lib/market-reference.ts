import { z } from "zod";

const decimalAmount = z.string().min(1).max(100).regex(/^\d+(?:\.\d+)?$/);

export const marketReferenceQuoteSchema = z.object({
  asset: z.string().regex(/^[A-Z0-9]{2,16}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  price: decimalAmount,
  provider: z.literal("Coinbase"),
  asOf: z.string().datetime({ offset: true }),
}).strict();

export const marketReferenceEnvelopeSchema = z.object({
  data: marketReferenceQuoteSchema,
}).strict();

export type MarketReferenceQuote = z.infer<typeof marketReferenceQuoteSchema>;

function decimalUnits(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  const scale = 10n ** BigInt(fraction.length);
  return {
    scale,
    units: BigInt(whole) * scale + BigInt(fraction || "0"),
  };
}

export function formatMarketReferenceAmount(
  amountBaseUnits: bigint,
  assetDecimals: number,
  unitPrice: string,
  currency: string,
): string | null {
  if (
    amountBaseUnits < 0n
    || !Number.isInteger(assetDecimals)
    || assetDecimals < 0
    || assetDecimals > 36
    || !/^\d+(?:\.\d+)?$/.test(unitPrice)
    || !/^[A-Z]{3}$/.test(currency)
  ) return null;

  const price = decimalUnits(unitPrice);
  if (price.units <= 0n) return null;
  const displayScale = 100n;
  const denominator = (10n ** BigInt(assetDecimals)) * price.scale;
  const displayUnits = (amountBaseUnits * price.units * displayScale + denominator / 2n) / denominator;
  if (amountBaseUnits > 0n && displayUnits === 0n) return `< ${currency} 0.01`;

  const integer = (displayUnits / displayScale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = (displayUnits % displayScale).toString().padStart(2, "0");
  return `${currency} ${integer}.${decimals}`;
}
