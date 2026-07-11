import { describe, expect, it } from "vitest";
import { formatPlatformCount } from "./platform-stats";

describe("formatPlatformCount", () => {
  it("formats large onchain counts without losing integer precision", () => {
    expect(formatPlatformCount(12_345_678_901_234_567_890n)).toBe("12,345,678,901,234,567,890");
  });

  it("keeps unavailable reads distinct from a real zero", () => {
    expect(formatPlatformCount(null)).toBe("--");
    expect(formatPlatformCount(0n)).toBe("0");
  });
});
