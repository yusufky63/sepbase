import { formatUnits, parseUnits } from "viem";

export function parseSettlementAmount(value: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error("Enter a valid decimal amount.");
  return parseUnits(value.trim(), decimals);
}

export function formatSettlementAmount(
  value: bigint,
  decimals: number,
  maximumFractionDigits = Math.min(decimals, 6),
): string {
  const formatted = formatUnits(value, decimals);
  const [whole = "0", fraction = ""] = formatted.split(".");
  const trimmed = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  if (value > 0n && whole === "0" && !trimmed && /[1-9]/.test(fraction)) {
    return maximumFractionDigits === 0
      ? "< 1"
      : `< 0.${"0".repeat(maximumFractionDigits - 1)}1`;
  }
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
