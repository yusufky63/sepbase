import { FatalError, sleep } from "workflow";
import { createV3PaidRegistrationRuntime } from "@/lib/x402/runtime-factory";
import { resumeRegistrationPlanWorkflow } from "@/lib/x402/workflow";

export type X402RegistrationWorkflowInput = {
  paymentIdentifier: string;
  planId: `sha256:${string}`;
};

export type X402RegistrationWorkflowResult = {
  paymentIdentifier: string;
  planId: `sha256:${string}`;
  status: "settled";
  commitTransaction: `0x${string}`;
  revealTransaction: `0x${string}`;
  settlementTransaction: `0x${string}`;
};

const MAX_DURABLE_POLLS = 480;
const POLL_INTERVAL_SECONDS = 15;

/**
 * Crash-safe orchestration. Payment/quote/secret material remains encrypted in
 * the external CAS; Workflow DevKit persists only the non-secret order keys.
 */
export async function x402RegistrationWorkflow(
  input: X402RegistrationWorkflowInput,
): Promise<X402RegistrationWorkflowResult> {
  "use workflow";

  for (let attempt = 0; attempt < MAX_DURABLE_POLLS; attempt += 1) {
    const result = await resumeRegistrationOrderStep(input);
    if (result.status === "settled") return result;
    await sleep(`${POLL_INTERVAL_SECONDS}s`);
  }
  throw new FatalError(
    "The paid registration order exceeded its bounded automatic reconciliation window; operator review is required.",
  );
}

export async function resumeRegistrationOrderStep(
  input: X402RegistrationWorkflowInput,
): Promise<X402RegistrationWorkflowResult | {
  paymentIdentifier: string;
  planId: `sha256:${string}`;
  status: "pending";
}> {
  "use step";
  const { runtime, siteOrigin } = createV3PaidRegistrationRuntime();
  const result = await resumeRegistrationPlanWorkflow({
    runtime,
    paymentIdentifier: input.paymentIdentifier,
    planId: input.planId,
    siteOrigin,
    nowSeconds: Math.floor(Date.now() / 1_000),
  });
  if (result.kind !== "settled") {
    return { ...input, status: "pending" };
  }
  const { record } = result;
  if (!record.commitTransaction || !record.revealTransaction || !record.settlementTransaction) {
    throw new FatalError("The settled paid-registration order is missing required transaction evidence.");
  }
  return {
    ...input,
    status: "settled",
    commitTransaction: record.commitTransaction,
    revealTransaction: record.revealTransaction,
    settlementTransaction: record.settlementTransaction,
  };
}
