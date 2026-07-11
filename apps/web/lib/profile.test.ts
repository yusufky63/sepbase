import { describe, expect, it } from "vitest";
import { emptyProfile } from "@/lib/contract/types";
import { getUtf8ByteLength, profileValidationError, safeHttpsUrl, socialProfileUrl } from "./profile";

describe("profile safety", () => {
  it("counts UTF-8 bytes rather than UTF-16 code units", () => {
    expect(getUtf8ByteLength("ş")).toBe(2);
  });

  it("rejects private, credentialed, and non-HTTPS links", () => {
    expect(safeHttpsUrl("http://example.com")).toBeNull();
    expect(safeHttpsUrl("https://127.0.0.1/avatar.png")).toBeNull();
    expect(safeHttpsUrl("https://user:pass@example.com")).toBeNull();
    expect(safeHttpsUrl("https://example.com/profile")).toBe("https://example.com/profile");
  });

  it("validates social handles and contract byte limits", () => {
    expect(socialProfileUrl("twitter", "@alice_01")).toBe("https://x.com/alice_01");
    expect(socialProfileUrl("github", "bad/path")).toBeNull();
    expect(profileValidationError({ ...emptyProfile, displayName: "ş".repeat(33) })).toContain("64 byte");
  });
});
