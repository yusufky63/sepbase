import { NameNormalizationError, normalizeName } from "@sepbase/sdk";
import {
  V3_OPTIONS,
  getServerV3Client,
  v3ApiContext,
  v3ApiError,
  v3ApiJson,
  v3Deployed,
  v3DeploymentPending,
  v3Manifest,
} from "@/lib/v3-api";

export { V3_OPTIONS as OPTIONS };

function canonicalLabel(raw: string) {
  const normalized = normalizeName(raw, v3Manifest.suffix, {
    minCodePoints: v3Manifest.nameRules.minCodepoints,
    maxCodePoints: v3Manifest.nameRules.maxCodepoints,
    maxUtf8Bytes: v3Manifest.nameRules.maxUtf8Bytes,
  });
  if (raw !== normalized.normalizedLabel) {
    throw new NameNormalizationError(
      "NON_CANONICAL_INPUT",
      "Machine API labels must use the canonical normalized label without a suffix.",
      normalized.normalizedLabel,
    );
  }
  return normalized.normalizedLabel;
}

export async function GET(_request: Request, context: { params: Promise<{ label: string }> }) {
  const { label: rawLabel } = await context.params;
  let label: string;
  try {
    label = canonicalLabel(rawLabel);
  } catch (error) {
    if (error instanceof NameNormalizationError) {
      return v3ApiError(400, error.code, error.message, {
        normalizedSuggestion: error.normalizedSuggestion ?? null,
      });
    }
    return v3ApiError(400, "INVALID_INPUT", "The name is invalid.");
  }
  if (!v3Deployed) return v3DeploymentPending();
  try {
    const client = await getServerV3Client();
    const record = await client.getNameRecord(label);
    return v3ApiJson({
      data: {
        ...record,
        tokenId: record.tokenId.toString(),
        expiresAt: record.expiresAt?.toString() ?? null,
        transferNonce: record.transferNonce.toString(),
        blockNumber: record.blockNumber.toString(),
      },
      context: v3ApiContext(),
    });
  } catch {
    return v3ApiError(503, "RPC_UNAVAILABLE", "The configured V3 RPC read failed.");
  }
}
