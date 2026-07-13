import {
  V3_OPTIONS,
  v3ApiContext,
  v3ApiJson,
  v3Manifest,
  v3PublicCapabilities,
  v3PublicX402Status,
} from "@/lib/v3-api";

export const dynamic = "force-static";
export { V3_OPTIONS as OPTIONS };

export function GET() {
  return v3ApiJson({
    data: {
      ...v3ApiContext(),
      contracts: v3Manifest.contracts,
      wiring: v3Manifest.wiring,
      capabilities: v3PublicCapabilities(),
      x402: v3PublicX402Status(),
      deployment: v3Manifest.deployment,
    },
  });
}
