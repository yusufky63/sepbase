import { getAddress, isAddress } from "viem";
import {
  V3_OPTIONS,
  getServerV3Client,
  v3ApiContext,
  v3ApiError,
  v3ApiJson,
  v3Deployed,
  v3DeploymentPending,
} from "@/lib/v3-api";

export { V3_OPTIONS as OPTIONS };

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = await context.params;
  if (!isAddress(rawAddress)) return v3ApiError(400, "INVALID_INPUT", "Address is not a valid EVM address.");
  if (!v3Deployed) return v3DeploymentPending();
  try {
    const address = getAddress(rawAddress);
    const client = await getServerV3Client();
    const result = await client.verifyAddress(address);
    return v3ApiJson({ data: result, context: v3ApiContext() });
  } catch {
    return v3ApiError(503, "RPC_UNAVAILABLE", "The configured V3 reverse-resolution read failed.");
  }
}
