import { x402Options } from "@/lib/x402/http";
import { handleV3PaidRegistration } from "@/lib/x402/paid-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return x402Options();
}

export async function POST(request: Request) {
  return handleV3PaidRegistration(request);
}
