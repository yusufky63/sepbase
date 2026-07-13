import { describe, expect, it } from "vitest";
import { parseV3SuiteManifest, type V3SuiteManifest } from "@sepbase/sdk";
import v3ManifestJson from "../public/deployment-manifest.v3.json";
import {
  isV3ReferralOperational,
  referralAttributionCookieName,
  referralCookieName,
  v3ReferralCookieNameFor,
} from "./referrals";

const draft = parseV3SuiteManifest(v3ManifestJson);
const address = "0x1000000000000000000000000000000000000001" as const;
const runtimeCodeHash = `0x${"11".repeat(32)}` as const;

function candidate(): V3SuiteManifest {
  return {
    ...draft,
    releaseStatus: "candidate",
    contracts: Object.fromEntries(Object.entries(draft.contracts).map(([key, value]) => [key, {
      ...value,
      address,
      runtimeCodeHash,
    }])) as unknown as V3SuiteManifest["contracts"],
    wiring: { ...draft.wiring, suiteConfigured: true },
  };
}

describe("referral attribution scope", () => {
  it("keeps the live V2 cookie behavior while the V3 manifest is still draft", () => {
    expect(isV3ReferralOperational(draft)).toBe(false);
    expect(referralAttributionCookieName).toBe(referralCookieName);
  });

  it("binds a V3 cookie name to the exact suite release, chain and controller", () => {
    const first = candidate();
    const firstName = v3ReferralCookieNameFor(first);
    expect(isV3ReferralOperational(first)).toBe(true);
    expect(firstName).toMatch(/^cns_ref_v3_84532_[a-f0-9]{64}_[a-f0-9]{40}$/);
    expect(firstName).not.toContain(":");

    const next = {
      ...first,
      suiteReleaseId: `sha256:${"b".repeat(64)}` as const,
    };
    expect(v3ReferralCookieNameFor(next)).not.toBe(firstName);
  });
});
