import { z } from "zod";
import { v3Manifest } from "@/lib/v3-api";
import { publicX402RegistrationReadiness } from "./config";
import { MAX_REGISTRATION_BODY_BYTES } from "./constants";
import { v3X402DeploymentProfile } from "./deployment-profile";
import { isX402RegistrationError, X402RegistrationError } from "./errors";
import { v3X402Context, x402Error, x402Json } from "./http";
import type { DurableRegistrationRecord } from "./registration";
import {
  createV3PaidRegistrationRuntime,
  type V3PaidRegistrationRuntime,
} from "./runtime-factory";
import { executeRegistrationPlanWorkflow } from "./workflow";
import { startV3RegistrationWorkflow } from "./workflow-start";

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const requestEnvelope = z.object({
  signedQuote: z.unknown(),
  quoteId: sha256,
  planId: sha256,
}).strict();

type Dependencies = {
  loadRuntime?: () => V3PaidRegistrationRuntime;
  executeWorkflow?: typeof executeRegistrationPlanWorkflow;
  startWorkflow?: typeof startV3RegistrationWorkflow;
  nowSeconds?: () => number;
};

async function readBoundedJson(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new X402RegistrationError(415, "JSON_REQUIRED", "The paid registration request must use application/json.");
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_REGISTRATION_BODY_BYTES)) {
    throw new X402RegistrationError(413, "REQUEST_TOO_LARGE", "The paid registration request is too large.");
  }
  if (!request.body) throw new X402RegistrationError(400, "MISSING_REQUEST_BODY", "A paid registration bundle is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_REGISTRATION_BODY_BYTES) {
        await reader.cancel();
        throw new X402RegistrationError(413, "REQUEST_TOO_LARGE", "The paid registration request is too large.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (isX402RegistrationError(error)) throw error;
    throw new X402RegistrationError(400, "INVALID_JSON", "The paid registration request is not valid UTF-8 JSON.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new X402RegistrationError(400, "INVALID_JSON", "The paid registration request is not valid JSON.");
  }
  const parsed = requestEnvelope.safeParse(value);
  if (!parsed.success) {
    throw new X402RegistrationError(400, "INVALID_REGISTRATION_BUNDLE", "The signed quote and V3 execution plan bundle is invalid.");
  }
  return parsed.data as {
    signedQuote: unknown;
    quoteId: `sha256:${string}`;
    planId: `sha256:${string}`;
  };
}

export function publicX402Order(record: DurableRegistrationRecord) {
  return {
    paymentIdentifier: record.paymentIdentifier,
    quoteId: record.quoteId,
    planId: record.planId,
    status: record.status,
    refundDisposition: record.refundDisposition,
    ...(record.commitTransaction ? { commitTransaction: record.commitTransaction } : {}),
    ...(record.revealTransaction ? { revealTransaction: record.revealTransaction } : {}),
    ...(record.settlementTransaction ? { settlementTransaction: record.settlementTransaction } : {}),
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    updatedAt: record.updatedAt,
  };
}

export async function handleV3PaidRegistration(
  request: Request,
  dependencies: Dependencies = {},
) {
  let configured: V3PaidRegistrationRuntime;
  try {
    configured = (dependencies.loadRuntime ?? createV3PaidRegistrationRuntime)();
  } catch {
    const readiness = publicX402RegistrationReadiness(v3X402DeploymentProfile(v3Manifest));
    return x402Error(
      503,
      "X402_PAID_EXECUTION_AWAITING_V3",
      "Paid registration is unavailable until the live V3 release and every external runtime capability are verified.",
      { readiness },
      v3X402Context(),
    );
  }

  try {
    const bundle = await readBoundedJson(request);
    const prepared = await configured.runtime.store.loadPreparedPlan({
      quoteId: bundle.quoteId,
      planId: bundle.planId,
    });
    if (!prepared) {
      throw new X402RegistrationError(404, "PREPARED_PLAN_NOT_FOUND", "The encrypted V3 registration plan was not found or has expired.");
    }
    const paymentSignatureHeader = request.headers.get("payment-signature");
    if (paymentSignatureHeader && paymentSignatureHeader.length > 128 * 1024) {
      throw new X402RegistrationError(431, "PAYMENT_SIGNATURE_TOO_LARGE", "PAYMENT-SIGNATURE is too large.");
    }
    const result = await (dependencies.executeWorkflow ?? executeRegistrationPlanWorkflow)({
      runtime: configured.runtime,
      signedQuoteValue: bundle.signedQuote,
      plan: prepared.executionPlan,
      siteOrigin: configured.siteOrigin,
      nowSeconds: (dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1_000)))(),
      paymentSignatureHeader,
      leaseSeconds: configured.leaseSeconds,
      deferExecution: true,
    });
    if (result.kind === "payment-required") {
      return x402Json({
        error: {
          code: result.error?.code ?? "PAYMENT_REQUIRED",
          message: result.error?.message ?? "A matching x402 V2 payment authorization is required.",
        },
        order: { quoteId: bundle.quoteId, planId: bundle.planId, status: "quoted" },
      }, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": result.paymentRequiredHeader },
      });
    }
    if (result.kind === "settled") {
      return x402Json({ data: { order: publicX402Order(result.record), replayed: result.replayed } }, {
        status: 200,
        headers: { "PAYMENT-RESPONSE": result.paymentResponseHeader },
      });
    }
    const workflow = await (dependencies.startWorkflow ?? startV3RegistrationWorkflow)({
      paymentIdentifier: result.record.paymentIdentifier,
      planId: bundle.planId,
    });
    return x402Json({
      data: {
        order: publicX402Order(result.record),
        workflow: { runId: workflow.runId },
      },
    }, { status: 202 });
  } catch (error) {
    if (isX402RegistrationError(error)) {
      return x402Error(error.status, error.code, error.message, error.details, v3X402Context());
    }
    return x402Error(503, "X402_RUNTIME_UNAVAILABLE", "The paid registration runtime is temporarily unavailable.", undefined, v3X402Context());
  }
}
