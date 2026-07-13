import { describe, expect, it } from "vitest";
import { V3AccountWorkspace } from "@/features/v3/account/v3-account-workspace";
import MePage from "./page";

describe("/me release boundary", () => {
  it("uses the V3 account workspace for the verified candidate", async () => {
    const page = await MePage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(V3AccountWorkspace);
    expect(page.props.initialTab).toBe("names");
  });

  it("preserves the requested account tab during the candidate release", async () => {
    const page = await MePage({ searchParams: Promise.resolve({ tab: "referrals" }) });
    expect(page.type).toBe(V3AccountWorkspace);
    expect(page.props.initialTab).toBe("referrals");
  });
});
