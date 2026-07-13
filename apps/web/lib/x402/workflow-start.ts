import { start } from "workflow/api";
import { x402RegistrationWorkflow } from "@/workflows/x402-registration";
import { X402_PAID_EXECUTION_IMPLEMENTED } from "./constants";
import { X402RegistrationError } from "./errors";
import { createV3PaidRegistrationRuntime } from "./runtime-factory";

type Environment = Record<string, string | undefined>;

export type X402WorkflowStartInput = {
  paymentIdentifier: string;
  planId: `sha256:${string}`;
};

export async function startV3RegistrationWorkflow(
  input: X402WorkflowStartInput,
  environment: Environment = process.env,
) {
  if (
    !X402_PAID_EXECUTION_IMPLEMENTED
    || environment.X402_WORKFLOW_ENABLED?.trim() !== "true"
    || environment.X402_WORKFLOW_BILLING_CONFIRMED?.trim() !== "true"
    || environment.X402_WORKFLOW_FLUID_COMPUTE_CONFIRMED?.trim() !== "true"
  ) {
    throw new X402RegistrationError(
      503,
      "DURABLE_WORKFLOW_NOT_READY",
      "The V3 paid registration workflow is not operationally enabled.",
    );
  }
  try {
    createV3PaidRegistrationRuntime(environment);
  } catch {
    throw new X402RegistrationError(
      503,
      "DURABLE_WORKFLOW_NOT_READY",
      "The V3 paid registration workflow is not operationally enabled.",
    );
  }
  const run = await start(x402RegistrationWorkflow, [input]);
  // Deliberately do not access run.returnValue; HTTP callers receive the run
  // handle immediately and poll the durable order state separately.
  return {
    runId: run.runId,
    order: {
      paymentIdentifier: input.paymentIdentifier,
      planId: input.planId,
      status: "reserved" as const,
    },
  };
}
