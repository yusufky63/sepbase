import { describe, expect, it } from "vitest";
import { AccountWorkspace } from "@/features/account/account-workspace";
import MePage from "./page";

describe("/me release boundary", () => {
  it("keeps the previous account workspace while V3 is a candidate", async () => {
    const page = await MePage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(AccountWorkspace);
    expect(page.props.initialTab).toBe("names");
  });

  it("preserves the requested previous-UI account tab", async () => {
    const page = await MePage({ searchParams: Promise.resolve({ tab: "referrals" }) });
    expect(page.type).toBe(AccountWorkspace);
    expect(page.props.initialTab).toBe("referrals");
  });
});
