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

export async function GET() {
  if (!v3Deployed) return v3DeploymentPending();
  try {
    const client = await getServerV3Client();
    const state = await client.getLiabilities();
    return v3ApiJson({
      data: state,
      context: v3ApiContext(),
    });
  } catch {
    return v3ApiError(503, "RPC_UNAVAILABLE", "The configured V3 liability read failed.");
  }
}
