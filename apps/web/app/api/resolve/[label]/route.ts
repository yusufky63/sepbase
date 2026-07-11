import { apiContext, apiError, apiJson, deploymentPending, OPTIONS, rpcFailure } from "@/lib/api-response";
import { isResolvableStatus, lifecycleLabel } from "@/lib/contract/lifecycle";
import { readName, serverPublicClient } from "@/lib/contract/server";
import { protocolDeployed } from "@/lib/deployment-manifest";
import { normalizeLabel } from "@/lib/name-normalization";

export { OPTIONS };

export async function GET(_request: Request, context: { params: Promise<{ label: string }> }) {
  const { label: rawLabel } = await context.params;
  const normalized = normalizeLabel(rawLabel, apiContext().suffix);
  if (!normalized.valid) return apiError(400, "INVALID_INPUT", normalized.reason ?? "Invalid label.");
  if (rawLabel !== normalized.label) {
    return apiError(400, "INVALID_INPUT", "Machine API labels must be canonical lowercase labels without a suffix.", {
      normalizedSuggestion: normalized.label,
    });
  }
  if (!protocolDeployed) return deploymentPending();

  try {
    const blockNumber = await serverPublicClient.getBlockNumber();
    const record = await readName(normalized.label, 1, blockNumber);
    if (!record) return deploymentPending();
    if (!record.owner || !isResolvableStatus(record.status)) {
      return apiError(404, "NAME_NOT_FOUND", "The name does not currently represent an active or grace-period identity.");
    }
    return apiJson({
      data: {
        label: normalized.label,
        fullName: normalized.fullName,
        resolvedAddress: isResolvableStatus(record.status) ? record.resolvedAddress : null,
        owner: record.owner,
        expiresAt: record.expiresAt?.toString() ?? null,
        status: lifecycleLabel(record.status),
        profile: record.profile,
        blockNumber: blockNumber.toString(),
      },
      context: apiContext(),
    });
  } catch {
    return rpcFailure();
  }
}
