import { getAddress, isAddress } from "viem";
import { apiContext, apiError, apiJson, deploymentPending, OPTIONS, rpcFailure } from "@/lib/api-response";
import { readName, readPrimaryName, serverPublicClient } from "@/lib/contract/server";
import { NAME_STATUS } from "@/lib/contract/types";
import { protocolDeployed } from "@/lib/deployment-manifest";

export { OPTIONS };

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = await context.params;
  if (!isAddress(rawAddress)) return apiError(400, "INVALID_ADDRESS", "Provide a valid EVM address.");
  if (!protocolDeployed) return deploymentPending();

  try {
    const address = getAddress(rawAddress);
    const blockNumber = await serverPublicClient.getBlockNumber();
    const primaryName = await readPrimaryName(address, blockNumber);
    const suffix = `.${apiContext().suffix}`;
    const label = primaryName && primaryName.endsWith(suffix)
      ? primaryName.slice(0, -suffix.length)
      : null;
    const record = label ? await readName(label, 1, blockNumber) : null;
    const effective = record?.status === NAME_STATUS.ACTIVE || record?.status === NAME_STATUS.GRACE;
    const ownerConfirmed = Boolean(record?.owner && record.owner.toLowerCase() === address.toLowerCase());
    const forwardConfirmed = Boolean(
      primaryName
      && record
      && effective
      && ownerConfirmed
      && record.fullName === primaryName
      && record.resolvedAddress?.toLowerCase() === address.toLowerCase(),
    );
    return apiJson({
      data: {
        address,
        primaryName: primaryName || null,
        label,
        owner: record?.owner ?? null,
        resolvedAddress: record?.resolvedAddress ?? null,
        expiresAt: record?.expiresAt?.toString() ?? null,
        status: record?.status === NAME_STATUS.ACTIVE
          ? "ACTIVE"
          : record?.status === NAME_STATUS.GRACE
            ? "GRACE"
            : null,
        ownerConfirmed,
        forwardConfirmed,
        verified: forwardConfirmed,
        blockNumber: blockNumber.toString(),
      },
      context: apiContext(),
    });
  } catch {
    return rpcFailure();
  }
}
