export type ShortNamePriceMultipliers = readonly [number, number, number];

export function priceMultiplierForLength(
  labelLength: number,
  multipliers: ShortNamePriceMultipliers,
): number {
  if (!Number.isInteger(labelLength) || labelLength < 1) {
    throw new Error("Label length must be a positive integer.");
  }
  return labelLength <= 3 ? multipliers[labelLength - 1] ?? 1 : 1;
}

export function annualPriceForLength(
  standardAnnualPrice: bigint,
  labelLength: number,
  multipliers: ShortNamePriceMultipliers,
): bigint {
  return standardAnnualPrice * BigInt(priceMultiplierForLength(labelLength, multipliers));
}

export function packShortNamePriceMultipliers(multipliers: ShortNamePriceMultipliers): number {
  const [one, two, three] = multipliers;
  return one | (two << 8) | (three << 16);
}
