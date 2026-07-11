import { describe, expect, it } from "vitest";
import { resolveAdminRole } from "./admin-access";

const owner = "0x1111111111111111111111111111111111111111" as const;
const pendingOwner = "0x2222222222222222222222222222222222222222" as const;
const viewer = "0xEAa823AB4C4eE00283d8ed7be713ddf8A5ba0Fac" as const;

describe("resolveAdminRole", () => {
  it("prioritizes live owner and pending-owner roles", () => {
    expect(resolveAdminRole(owner, owner, pendingOwner, [viewer])).toBe("owner");
    expect(resolveAdminRole(pendingOwner, owner, pendingOwner, [viewer])).toBe("pending-owner");
  });

  it("matches configured viewers without checksum-case assumptions", () => {
    expect(resolveAdminRole(viewer.toLowerCase() as `0x${string}`, owner, pendingOwner, [viewer])).toBe("viewer");
  });

  it("rejects disconnected and unlisted wallets", () => {
    expect(resolveAdminRole(undefined, owner, pendingOwner, [viewer])).toBeNull();
    expect(resolveAdminRole("0x3333333333333333333333333333333333333333", owner, pendingOwner, [viewer])).toBeNull();
  });
});
