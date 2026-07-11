import { describe, expect, it } from "vitest";
import { normalizeLabel } from "./name-normalization";

describe("normalizeLabel", () => {
  it("strips the configured suffix once", () => {
    expect(normalizeLabel(" Alice.SEPBASE ", "sepbase")).toMatchObject({
      label: "alice",
      fullName: "alice.sepbase",
      valid: true,
    });
  });

  it("does not silently rewrite invalid input", () => {
    expect(normalizeLabel("ali_ce", "sepbase")).toMatchObject({
      label: "ali_ce",
      valid: false,
    });
  });

  it("accepts premium one-character labels", () => {
    expect(normalizeLabel("a", "sepbase")).toMatchObject({
      label: "a",
      fullName: "a.sepbase",
      valid: true,
    });
  });

  it("enforces the complete canonical grammar", () => {
    expect(normalizeLabel("-a", "sepbase").valid).toBe(false);
    expect(normalizeLabel("a-", "sepbase").valid).toBe(false);
    expect(normalizeLabel("a--b", "sepbase").valid).toBe(false);
    expect(normalizeLabel("a".repeat(33), "sepbase").valid).toBe(false);
  });
});
