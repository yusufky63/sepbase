import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { normalizeLabel } from "@/lib/name-normalization";

export function parsePercentToBps(value: string, maximumBps: number): number {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Enter a percentage with at most two decimal places.");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const result = Number(BigInt(whole) * 100n + BigInt((fraction || "0").padEnd(2, "0")));
  if (result > maximumBps) throw new Error(`The maximum allowed value is ${maximumBps / 100}%.`);
  return result;
}

export function parseAdminAddress(value: string, contractAddress?: string | null): Address {
  const normalized = value.trim();
  if (!isAddress(normalized)) throw new Error("Enter a valid EVM address.");
  const address = getAddress(normalized);
  if (address === zeroAddress || (contractAddress && address.toLowerCase() === contractAddress.toLowerCase())) {
    throw new Error("This address cannot be used as a recipient.");
  }
  return address;
}

export function parseReservedLabels(value: string, suffix: string): string[] {
  const candidates = value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  if (candidates.length === 0) throw new Error("Enter at least one name.");
  if (candidates.length > 100) throw new Error("A maximum of 100 names can be updated at once.");
  const labels = candidates.map((candidate) => {
    const normalized = normalizeLabel(candidate, suffix);
    if (!normalized.valid) throw new Error(`${candidate}: ${normalized.reason}`);
    return normalized.label;
  });
  if (new Set(labels).size !== labels.length) throw new Error("Remove duplicate names from the batch.");
  return labels;
}

export function parseMetadataBaseURI(value: string): string {
  const normalized = value.trim();
  if (!normalized.endsWith("/")) throw new Error("Metadata base URL must end with a slash.");
  try {
    const url = new URL(normalized);
    if (!url.protocol) throw new Error();
  } catch {
    throw new Error("Enter a valid absolute metadata URL.");
  }
  return normalized;
}
