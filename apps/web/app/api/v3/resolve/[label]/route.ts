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

export async function GET(request: Request, context: { params: Promise<{ label: string }> }) {
  const { label: rawLabel } = await context.params;
  let label: string;
  try {
    const normalized = normalizeName(rawLabel, v3Manifest.suffix, {
      minCodePoints: v3Manifest.nameRules.minCodepoints,
      maxCodePoints: v3Manifest.nameRules.maxCodepoints,
      maxUtf8Bytes: v3Manifest.nameRules.maxUtf8Bytes,
    });
    if (rawLabel !== normalized.normalizedLabel) {
      return v3ApiError(400, "NON_CANONICAL_INPUT", "Use the canonical label without a suffix.", {
        normalizedSuggestion: normalized.normalizedLabel,
      });
    }
    label = normalized.normalizedLabel;
  } catch (error) {
    return v3ApiError(
      400,
      error instanceof NameNormalizationError ? error.code : "INVALID_INPUT",
      error instanceof Error ? error.message : "The name is invalid.",
    );
  }
  const textKey = new URL(request.url).searchParams.get("textKey");
  if (textKey !== null && (!textKey || new TextEncoder().encode(textKey).byteLength > 64)) {
    return v3ApiError(400, "INVALID_TEXT_KEY", "textKey must contain 1-64 UTF-8 bytes.");
  }
  if (!v3Deployed) return v3DeploymentPending();
  try {
    const client = await getServerV3Client();
    const record = await client.getNameRecord(label);
    if (record.status !== "active" && record.status !== "grace") {
      return v3ApiError(404, "NAME_NOT_FOUND", "The name is not an effective identity.");
    }
    const textValue = textKey ? await client.resolveText(label, textKey, record.blockNumber) : undefined;
    return v3ApiJson({
      data: {
        label: record.label,
        fullName: record.fullName,
        node: record.node,
        owner: record.owner,
        resolvedAddress: record.resolvedAddress,
        status: record.status,
        expiresAt: record.expiresAt?.toString() ?? null,
        ...(textKey ? { text: { key: textKey, value: textValue } } : {}),
        blockNumber: record.blockNumber.toString(),
      },
      context: v3ApiContext(),
    });
  } catch {
    return v3ApiError(503, "RPC_UNAVAILABLE", "The configured V3 resolution read failed.");
  }
}
