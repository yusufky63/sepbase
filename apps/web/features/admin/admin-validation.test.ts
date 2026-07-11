import { describe, expect, it } from "vitest";
import { parseAdminAddress, parseMetadataBaseURI, parsePercentToBps, parseReservedLabels } from "./admin-validation";

describe("admin validation", () => {
  it("parses percentages without floating-point rounding", () => {
    expect(parsePercentToBps("10", 2000)).toBe(1000);
    expect(parsePercentToBps("0.25", 500)).toBe(25);
    expect(() => parsePercentToBps("5.01", 500)).toThrow("maximum");
  });

  it("validates recipients and metadata URLs", () => {
    expect(parseAdminAddress("0x1111111111111111111111111111111111111111"))
      .toBe("0x1111111111111111111111111111111111111111");
    expect(() => parseAdminAddress("0x0000000000000000000000000000000000000000")).toThrow("cannot");
    expect(parseMetadataBaseURI("https://names.example/api/metadata/")).toBe("https://names.example/api/metadata/");
    expect(() => parseMetadataBaseURI("https://names.example/api/metadata")).toThrow("slash");
  });

  it("normalizes and deduplicates reserved labels", () => {
    expect(parseReservedLabels("Alice.sepbase, builder", "sepbase")).toEqual(["alice", "builder"]);
    expect(() => parseReservedLabels("alice alice", "sepbase")).toThrow("duplicate");
  });
});
