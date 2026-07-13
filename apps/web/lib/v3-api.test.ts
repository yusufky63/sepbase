import { describe, expect, it } from "vitest";
import {
  v3ApiJson,
  v3Deployed,
  v3PaidX402Operational,
  v3PublicUiActive,
  v3PublicCapabilities,
  v3PublicX402Status,
} from "./v3-api";

describe("V3 API release boundary", () => {
  it("enables candidate reads while paid x402 execution stays fail closed", () => {
    expect(v3Deployed).toBe(true);
    expect(v3PublicUiActive).toBe(false);
    expect(v3PaidX402Operational).toBe(false);
    expect(v3PublicCapabilities().paidX402).toBe(false);
    expect(v3PublicX402Status().paidExecutionAvailable).toBe(false);
  });

  it("serializes nested bigint values at the shared response boundary", async () => {
    const response = v3ApiJson({
      data: {
        blockNumber: 123n,
        nested: [{ amount: 456n }],
      },
    });
    await expect(response.json()).resolves.toEqual({
      data: {
        blockNumber: "123",
        nested: [{ amount: "456" }],
      },
    });
  });
});
