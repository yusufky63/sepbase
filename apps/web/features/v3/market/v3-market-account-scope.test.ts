import { describe, expect, it } from "vitest";
import { createV3MarketFormState } from "./v3-market-form";
import { v3MarketWorkspaceScopeKey } from "./v3-market-account-scope";

const walletA = "0x1111111111111111111111111111111111111111";
const walletB = "0x2222222222222222222222222222222222222222";

describe("V3 market account scope", () => {
  it("remounts form/review state for an account or chain change and defaults recipient to the new wallet", () => {
    expect(v3MarketWorkspaceScopeKey(walletA, 84_532)).not.toBe(
      v3MarketWorkspaceScopeKey(walletB, 84_532),
    );
    expect(v3MarketWorkspaceScopeKey(walletA, 84_532)).not.toBe(
      v3MarketWorkspaceScopeKey(walletA, 1),
    );
    expect(createV3MarketFormState(walletB).recipient).toBe(walletB);
  });
});
