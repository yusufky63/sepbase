import { getAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { projectConfig } from "@/config/project.config";
import {
  accountTabIndexForKey,
  isRenderableOwnedName,
  ownedNameLabel,
  validateClaimRecipient,
} from "./account-workspace";

describe("account workspace helpers", () => {
  it("supports wrapping arrows and Home/End for the roving tab stop", () => {
    expect(accountTabIndexForKey("ArrowRight", 2, 3)).toBe(0);
    expect(accountTabIndexForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(accountTabIndexForKey("Home", 2, 3)).toBe(0);
    expect(accountTabIndexForKey("End", 0, 3)).toBe(2);
    expect(accountTabIndexForKey("Enter", 1, 3)).toBeNull();
  });

  it("normalizes a valid alternative claim recipient to its checksum form", () => {
    const input = "0x52908400098527886e0f7030069857d2e4169ee7";
    expect(validateClaimRecipient(input)).toEqual({ address: getAddress(input), error: null });
  });

  it("rejects invalid and zero claim recipients", () => {
    expect(validateClaimRecipient("not-an-address").address).toBeNull();
    expect(validateClaimRecipient(zeroAddress).address).toBeNull();
  });

  it("refuses missing or malformed full names instead of building a broken route", () => {
    expect(ownedNameLabel(undefined)).toBeNull();
    expect(ownedNameLabel("alice.other")).toBeNull();
    expect(ownedNameLabel(`.${projectConfig.brand.suffix}`)).toBeNull();
    expect(ownedNameLabel(`alice.${projectConfig.brand.suffix}`)).toBe("alice");
  });

  it("rejects partial owned-name records before renewal or name rendering", () => {
    const complete = {
      tokenId: 1n,
      fullName: `alice.${projectConfig.brand.suffix}`,
      status: 1,
      expiresAt: 2_000_000_000n,
      listing: null,
    };
    expect(isRenderableOwnedName(complete)).toBe(true);
    expect(isRenderableOwnedName({ ...complete, fullName: undefined })).toBe(false);
    expect(isRenderableOwnedName({ ...complete, expiresAt: undefined })).toBe(false);
  });
});
