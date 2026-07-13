import { describe, expect, it } from "vitest";
import { wagmiConfig } from "./wagmi";

describe("wagmi connector safety", () => {
  it("does not expose the ambiguous targetless injected connector", () => {
    expect(wagmiConfig.connectors.some((connector) => connector.id === "injected")).toBe(false);
  });
});
