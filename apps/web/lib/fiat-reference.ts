export type FiatReference = {
  currency: string;
  amount: string;
  asOf: string;
  maxAgeDays: number;
};

export function isFiatReferenceCurrent(reference: FiatReference, now = new Date()) {
  const asOf = Date.parse(`${reference.asOf}T00:00:00Z`);
  const expiresAt = asOf + reference.maxAgeDays * 86_400_000;
  return Number.isFinite(asOf) && now.getTime() >= asOf && now.getTime() <= expiresAt;
}

export function formatFiatReferenceAmount(
  amountBaseUnits: bigint,
  standardAnnualPriceBaseUnits: bigint,
  reference: FiatReference | null,
  now = new Date(),
): string | null {
  if (
    !reference
    || !isFiatReferenceCurrent(reference, now)
    || amountBaseUnits < 0n
    || standardAnnualPriceBaseUnits <= 0n
  ) return null;

  const [whole = "0", fraction = ""] = reference.amount.split(".");
  const referenceScale = 10n ** BigInt(fraction.length);
  const referenceUnits = BigInt(whole) * referenceScale + BigInt(fraction || "0");
  const displayScale = 100n;
  const denominator = standardAnnualPriceBaseUnits * referenceScale;
  const displayUnits = (amountBaseUnits * referenceUnits * displayScale + denominator / 2n) / denominator;
  if (amountBaseUnits > 0n && displayUnits === 0n) return `< ${reference.currency} 0.01`;

  const integer = (displayUnits / displayScale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = (displayUnits % displayScale).toString().padStart(2, "0");
  return `${reference.currency} ${integer}.${decimals}`;
}
