import { describe, expect, it } from "vitest";
import { startV3RegistrationWorkflow } from "./workflow-start";
import { resumeRegistrationOrderStep } from "@/workflows/x402-registration";

describe("V3 Workflow DevKit gate", () => {
  it("cannot be activated before the V3 ABI/manifest adapter is finalized", async () => {
    await expect(startV3RegistrationWorkflow({
      paymentIdentifier: "pay_1234567890abcdef",
      planId: `sha256:${"11".repeat(32)}`,
    }, {
      X402_WORKFLOW_ENABLED: "true",
      X402_WORKFLOW_BILLING_CONFIRMED: "true",
      X402_WORKFLOW_FLUID_COMPUTE_CONFIRMED: "true",
    })).rejects.toMatchObject({
      code: "DURABLE_WORKFLOW_NOT_READY",
    });
  });

  it("fails the first durable resume step closed when invoked without a live release", async () => {
    await expect(resumeRegistrationOrderStep({
      paymentIdentifier: "pay_1234567890abcdef",
      planId: `sha256:${"22".repeat(32)}`,
    })).rejects.toMatchObject({ status: 503 });
  });
});
