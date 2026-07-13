import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import type {
  SepbaseV3Client,
  V3NameRecord,
  V3SuiteManifest,
  V3TransactionPlan,
} from "@sepbase/sdk";
import {
  loadV3AccountSnapshot,
  prepareV3AccountAction,
  validateV3AddressRecord,
  validateV3MigrationLabel,
  validateV3Recipient,
  validateV3TextRecord,
  v3AccountTabIndexForKey,
  v3PrimaryPermission,
} from "./v3-account-model";

const account = "0x1111111111111111111111111111111111111111" as Address;
const recipient = "0x2222222222222222222222222222222222222222" as Address;
const suiteContract = "0x3333333333333333333333333333333333333333" as Address;
const plan = { functionName: "test" } as V3TransactionPlan;

function manifest() {
  return {
    contracts: {
      registry: { address: suiteContract },
      controller: { address: null },
    },
  } as unknown as V3SuiteManifest;
}

describe("V3 account model", () => {
  it("pins names and balances to exactly one block", async () => {
    const getOwnedNames = vi.fn(async (_account, _cursor, _limit, blockNumber) => ({
      items: [], total: 0n, nextCursor: 0n, blockNumber,
    }));
    const getAccountBalances = vi.fn(async (_account, blockNumber) => ({
      account, referralRewards: 0n, marketplaceClaimable: 0n,
      primary: { address: account, name: null, verified: false, reason: "no-primary", blockNumber },
      blockNumber,
    }));
    const client = {
      manifest: { requiredConfirmations: 5 },
      publicClient: { getBlockNumber: vi.fn(async () => 900n) },
      getOwnedNames,
      getAccountBalances,
    } as unknown as SepbaseV3Client;

    await expect(loadV3AccountSnapshot(client, account, 12n, 12)).resolves.toMatchObject({ blockNumber: 896n });
    expect(getOwnedNames).toHaveBeenCalledWith(account, 12n, 12, 896n);
    expect(getAccountBalances).toHaveBeenCalledWith(account, 896n);
  });

  it("fails closed when either account read escapes the pinned block", async () => {
    const client = {
      manifest: { requiredConfirmations: 1 },
      publicClient: { getBlockNumber: vi.fn(async () => 900n) },
      getOwnedNames: vi.fn(async () => ({ items: [], total: 0n, nextCursor: 0n, blockNumber: 901n })),
      getAccountBalances: vi.fn(async () => ({ blockNumber: 900n })),
    } as unknown as SepbaseV3Client;
    await expect(loadV3AccountSnapshot(client, account)).rejects.toThrow("V3_ACCOUNT_BLOCK_MISMATCH");
  });

  it("maps every account action to an SDK plan and forces safe transfer", async () => {
    const methods = {
      prepareRenew: vi.fn(async () => plan),
      prepareSetAddress: vi.fn(async () => plan),
      prepareSetText: vi.fn(async () => plan),
      prepareSetPrimary: vi.fn(async () => plan),
      prepareClearPrimary: vi.fn(async () => plan),
      prepareTransfer: vi.fn(async () => plan),
      prepareReferralClaim: vi.fn(async () => plan),
      prepareMarketplaceClaim: vi.fn(async () => plan),
      prepareMigrationClaim: vi.fn(async () => plan),
    };
    const client = methods as unknown as SepbaseV3Client;
    await prepareV3AccountAction(client, account, { kind: "renew", tokenId: 7n, durationYears: 2 });
    await prepareV3AccountAction(client, account, { kind: "set-address", label: "alice", target: recipient });
    await prepareV3AccountAction(client, account, { kind: "set-text", label: "alice", key: "url", value: "https://example.com" });
    await prepareV3AccountAction(client, account, { kind: "set-primary", tokenId: 7n });
    await prepareV3AccountAction(client, account, { kind: "clear-primary" });
    await prepareV3AccountAction(client, account, { kind: "transfer", tokenId: 7n, recipient });
    await prepareV3AccountAction(client, account, { kind: "claim-referral", recipient });
    await prepareV3AccountAction(client, account, { kind: "claim-marketplace", recipient });
    await prepareV3AccountAction(client, account, {
      kind: "migrate",
      legacyLabel: "alice-one",
      recipient,
      expectedLegacyOwner: account,
      importLegacyResolution: true,
      expectedLegacyResolution: recipient,
    });

    expect(methods.prepareRenew).toHaveBeenCalledWith({ owner: account, tokenId: 7n, durationYears: 2 });
    expect(methods.prepareClearPrimary).toHaveBeenCalledWith({ owner: account });
    expect(methods.prepareTransfer).toHaveBeenCalledWith({ owner: account, recipient, tokenId: 7n, safe: true });
    expect(methods.prepareMarketplaceClaim).toHaveBeenCalledWith({ account, recipient });
    expect(methods.prepareMigrationClaim).toHaveBeenCalledWith({
      caller: account,
      legacyLabel: "alice-one",
      recipient,
      expectedLegacyOwner: account,
      importLegacyResolution: true,
      expectedLegacyResolution: recipient,
    });
  });

  it("rejects unsafe recipients and enforces resolver byte limits", () => {
    expect(validateV3Recipient("nope", manifest()).error).toMatch(/valid EVM/i);
    expect(validateV3Recipient("0x0000000000000000000000000000000000000000", manifest()).error).toMatch(/zero/i);
    expect(validateV3Recipient(suiteContract, manifest()).error).toMatch(/suite contract/i);
    expect(validateV3Recipient(recipient, manifest())).toEqual({ address: recipient, error: null });
    expect(validateV3AddressRecord("0x0000000000000000000000000000000000000000").error).toBeNull();
    expect(validateV3TextRecord("", "value")).toMatch(/required/i);
    expect(validateV3TextRecord("k".repeat(65), "value")).toMatch(/64/);
    expect(validateV3TextRecord("url", "x".repeat(513))).toMatch(/512/);
    expect(validateV3TextRecord("url", "https://example.com")).toBeNull();
    expect(validateV3MigrationLabel("alice-one")).toEqual({ label: "alice-one", error: null });
    expect(validateV3MigrationLabel("Alice").error).toMatch(/exact/i);
    expect(validateV3MigrationLabel("alice.sepbase").error).toMatch(/without a suffix/i);
  });

  it("requires forward confirmation for primary and supports keyboard tab movement", () => {
    const record = {
      status: "active",
      owner: account,
      resolvedAddress: recipient,
    } as V3NameRecord;
    expect(v3PrimaryPermission(record, account)).toMatchObject({ allowed: false });
    expect(v3PrimaryPermission({ ...record, resolvedAddress: account }, account)).toEqual({ allowed: true, reason: null });
    expect(v3AccountTabIndexForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(v3AccountTabIndexForKey("End", 0, 3)).toBe(2);
  });
});
