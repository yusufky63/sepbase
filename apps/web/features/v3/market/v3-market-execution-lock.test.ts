import { describe, expect, it } from "vitest";
import {
  acquireV3MarketExecutionLease,
  isV3MarketExecutionLocked,
  releaseV3MarketExecutionLease,
} from "./v3-market-execution-lock";

describe("V3 market execution lock", () => {
  it("keeps one module-scoped lease until the exact owner releases it", () => {
    const lease = acquireV3MarketExecutionLease();
    expect(lease).not.toBeNull();
    try {
      expect(isV3MarketExecutionLocked()).toBe(true);
      expect(acquireV3MarketExecutionLease()).toBeNull();
      releaseV3MarketExecutionLease(Symbol("unrelated"));
      expect(isV3MarketExecutionLocked()).toBe(true);
    } finally {
      releaseV3MarketExecutionLease(lease!);
    }
    expect(isV3MarketExecutionLocked()).toBe(false);
  });
});
