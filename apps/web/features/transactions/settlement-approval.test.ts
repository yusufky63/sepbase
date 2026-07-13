import { describe, expect, it } from "vitest";
import { deriveSettlementApprovalState } from "./settlement-approval";

describe("deriveSettlementApprovalState", () => {
  it("keeps unknown reads distinct from zero balance and allowance", () => {
    expect(deriveSettlementApprovalState(undefined, 10n, "buy")).toEqual({
      allowance: null,
      balance: null,
      healthAllowsPayment: false,
      required: null,
      sufficientBalance: null,
    });
  });

  it("requires sufficient balance and an open, solvent buy path", () => {
    expect(deriveSettlementApprovalState([9n, 0n, true, false], 10n, "buy")).toMatchObject({
      healthAllowsPayment: true,
      required: true,
      sufficientBalance: false,
    });
    expect(deriveSettlementApprovalState([10n, 0n, true, true], 10n, "buy").healthAllowsPayment).toBe(false);
  });

  it("allows renewal health checks while registrations are paused", () => {
    expect(deriveSettlementApprovalState([10n, 0n, true, true], 10n, "renew").healthAllowsPayment).toBe(true);
  });
});
