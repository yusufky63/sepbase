import { ens_normalize } from "@adraffy/ens-normalize";
import { keccak256, namehash, toBytes, type Hex } from "viem";

export const SEPBASE_NORMALIZATION = {
  standard: "ENSIP-15",
  implementation: "@adraffy/ens-normalize",
  implementationVersion: "1.11.1",
  unicodeVersion: "17.0.0",
  cldrVersion: "47",
  profileIdentifier: "ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47",
  profileHash: "0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638",
} as const;

export const DEFAULT_NAME_LIMITS = {
  minCodePoints: 1,
  maxCodePoints: 32,
  maxUtf8Bytes: 255,
} as const;

export type NameNormalizationErrorCode =
  | "EMPTY_NAME"
  | "INVALID_NAME"
  | "INVALID_SUFFIX"
  | "SUBDOMAIN_NOT_SUPPORTED"
  | "LABEL_LENGTH"
  | "LABEL_BYTES"
  | "NON_CANONICAL_INPUT";

export class NameNormalizationError extends Error {
  readonly code: NameNormalizationErrorCode;
  readonly normalizedSuggestion: string | undefined;

  constructor(
    code: NameNormalizationErrorCode,
    message: string,
    normalizedSuggestion?: string,
  ) {
    super(message);
    this.name = "NameNormalizationError";
    this.code = code;
    this.normalizedSuggestion = normalizedSuggestion;
  }
}

export type NormalizedName = {
  rawInput: string;
  normalizedLabel: string;
  normalizedFullName: string;
  suffix: string;
  labelHash: Hex;
  node: Hex;
  tokenId: bigint;
  codePointLength: number;
  utf8ByteLength: number;
  changed: boolean;
};

type NameLimits = {
  minCodePoints?: number;
  maxCodePoints?: number;
  maxUtf8Bytes?: number;
};

function normalizeEnsValue(value: string, field: "name" | "suffix") {
  try {
    return ens_normalize(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "ENSIP-15 normalization failed.";
    throw new NameNormalizationError(
      field === "suffix" ? "INVALID_SUFFIX" : "INVALID_NAME",
      `${field === "suffix" ? "Suffix" : "Name"} is not ENSIP-15 compatible: ${detail}`,
    );
  }
}

export function normalizeSuffix(input: string) {
  const candidate = input.trim().replace(/^\./, "");
  if (!candidate) throw new NameNormalizationError("INVALID_SUFFIX", "Suffix cannot be empty.");
  const normalized = normalizeEnsValue(candidate, "suffix");
  if (normalized.includes(".")) {
    throw new NameNormalizationError("INVALID_SUFFIX", "Suffix must contain exactly one label.");
  }
  return normalized;
}

export function normalizeName(
  input: string,
  suffixInput: string,
  limits: NameLimits = {},
): NormalizedName {
  const rawInput = input;
  const candidate = input.trim();
  if (!candidate) throw new NameNormalizationError("EMPTY_NAME", "Name cannot be empty.");

  const suffix = normalizeSuffix(suffixInput);
  const normalizedInput = normalizeEnsValue(candidate, "name");
  const labels = normalizedInput.split(".");

  let normalizedLabel: string;
  if (labels.length === 1) {
    normalizedLabel = labels[0] ?? "";
  } else if (labels.length === 2 && labels[1] === suffix) {
    normalizedLabel = labels[0] ?? "";
  } else if (labels.at(-1) === suffix) {
    throw new NameNormalizationError(
      "SUBDOMAIN_NOT_SUPPORTED",
      `Only one label before .${suffix} is supported by this deployment.`,
    );
  } else {
    throw new NameNormalizationError(
      "INVALID_SUFFIX",
      `Name must be an unqualified label or end in .${suffix}.`,
    );
  }

  if (!normalizedLabel) throw new NameNormalizationError("EMPTY_NAME", "Name label cannot be empty.");

  const minCodePoints = limits.minCodePoints ?? DEFAULT_NAME_LIMITS.minCodePoints;
  const maxCodePoints = limits.maxCodePoints ?? DEFAULT_NAME_LIMITS.maxCodePoints;
  const maxUtf8Bytes = limits.maxUtf8Bytes ?? DEFAULT_NAME_LIMITS.maxUtf8Bytes;
  const codePointLength = Array.from(normalizedLabel).length;
  const utf8ByteLength = toBytes(normalizedLabel).length;

  if (codePointLength < minCodePoints || codePointLength > maxCodePoints) {
    throw new NameNormalizationError(
      "LABEL_LENGTH",
      `Normalized label must contain ${minCodePoints}-${maxCodePoints} Unicode code points.`,
    );
  }
  if (utf8ByteLength > maxUtf8Bytes) {
    throw new NameNormalizationError(
      "LABEL_BYTES",
      `Normalized label must not exceed ${maxUtf8Bytes} UTF-8 bytes.`,
    );
  }

  const normalizedFullName = `${normalizedLabel}.${suffix}`;
  const labelHash = keccak256(toBytes(normalizedLabel));
  const node = namehash(normalizedFullName);

  return {
    rawInput,
    normalizedLabel,
    normalizedFullName,
    suffix,
    labelHash,
    node,
    tokenId: BigInt(labelHash),
    codePointLength,
    utf8ByteLength,
    changed: candidate !== normalizedLabel && candidate !== normalizedFullName,
  };
}

/**
 * Machine and signing surfaces use canonical unqualified labels. UI surfaces may
 * call normalizeName first, show the suggestion, and request explicit review.
 */
export function assertCanonicalLabel(input: string, suffix: string, limits?: NameLimits) {
  const normalized = normalizeName(input, suffix, limits);
  if (input !== normalized.normalizedLabel) {
    throw new NameNormalizationError(
      "NON_CANONICAL_INPUT",
      "Use the canonical normalized label without a suffix.",
      normalized.normalizedLabel,
    );
  }
  return normalized;
}
