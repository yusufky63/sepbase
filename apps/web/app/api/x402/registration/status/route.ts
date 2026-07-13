import { z } from "zod";
import { isX402RegistrationError } from "@/lib/x402/errors";
import { v3X402Context, x402Error, x402Json, x402Options } from "@/lib/x402/http";
import { publicX402Order } from "@/lib/x402/paid-route";
import { createV3PaidRegistrationRuntime } from "@/lib/x402/runtime-factory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paymentIdentifier = z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);
const planId = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export function OPTIONS() {
  return x402Options();
}

export async function GET(request: Request) {
  let configured: ReturnType<typeof createV3PaidRegistrationRuntime>;
  try {
    configured = createV3PaidRegistrationRuntime();
  } catch {
    return x402Error(503, "X402_PAID_EXECUTION_AWAITING_V3", "The live V3 paid order runtime is unavailable.", undefined, v3X402Context());
  }
  try {
    const url = new URL(request.url);
    const allowed = new Set(["paymentIdentifier", "planId"]);
    if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
      return x402Error(400, "UNKNOWN_INPUT", "The paid order status query contains an unsupported parameter.", undefined, v3X402Context());
    }
    if (url.searchParams.getAll("paymentIdentifier").length !== 1 || url.searchParams.getAll("planId").length !== 1) {
      return x402Error(400, "AMBIGUOUS_INPUT", "paymentIdentifier and planId are each required exactly once.", undefined, v3X402Context());
    }
    const parsed = z.object({ paymentIdentifier, planId }).safeParse({
      paymentIdentifier: url.searchParams.get("paymentIdentifier"),
      planId: url.searchParams.get("planId"),
    });
    if (!parsed.success) {
      return x402Error(400, "INVALID_ORDER_ID", "The paid order identifiers are invalid.", undefined, v3X402Context());
    }
    const record = await configured.runtime.store.loadRecord({
      paymentIdentifier: parsed.data.paymentIdentifier,
      planId: parsed.data.planId as `sha256:${string}`,
    });
    if (!record) {
      return x402Error(404, "REGISTRATION_ORDER_NOT_FOUND", "The paid registration order was not found.", undefined, v3X402Context());
    }
    return x402Json({ data: { order: publicX402Order(record) }, context: v3X402Context() });
  } catch (error) {
    if (isX402RegistrationError(error)) {
      return x402Error(error.status, error.code, error.message, error.details, v3X402Context());
    }
    return x402Error(503, "X402_RUNTIME_UNAVAILABLE", "The paid order status runtime is temporarily unavailable.", undefined, v3X402Context());
  }
}
