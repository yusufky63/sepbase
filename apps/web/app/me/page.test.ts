import { describe, expect, it } from "vitest";
import { AccountWorkspace } from "@/features/account/account-workspace";
import MePage from "./page";

describe("/me release boundary", () => {
  it("keeps the deployed V2 account workspace while the V3 manifest is draft", async () => {
    const page = await MePage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(AccountWorkspace);
    expect(page.props.initialTab).toBe("names");
  });

  it("preserves the requested V2 account tab during the draft release", async () => {
    const page = await MePage({ searchParams: Promise.resolve({ tab: "referrals" }) });
    expect(page.type).toBe(AccountWorkspace);
    expect(page.props.initialTab).toBe("referrals");
  });
});
