import { readFile } from "node:fs/promises";
import {
  decodeFunctionData,
  getAddress,
  zeroAddress,
  type Abi,
  type Chain,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { NotDeployedError } from "./errors";
import { normalizeName } from "./normalization";
import {
  chainNameMigrationV3Abi,
  chainNameMarketplaceV3Abi,
  chainNameRegistryV3Abi,
  chainNameResolverV3Abi,
} from "./v3-abi.generated";
import {
  createSepbaseV3Client,
  createSepbaseV3ClientFromVerifiedContext,
  hashV3NormalizationAttestation,
} from "./v3-client";
import type { V3SuiteContext } from "./v3-contract";
import {
  calculateV3SuiteReleaseId,
  parseV3SuiteManifest,
  V3_SUITE_MODULE_KEYS,
} from "./v3-manifest";

const account = getAddress("0x1111111111111111111111111111111111111111");
const recipient = getAddress("0x2222222222222222222222222222222222222222");
const legacyRegistry = getAddress("0xe000de3efe798Aa4F834fd952Bef35BAE1B16945");
const aliceTokenId = normalizeName("alice", "sepbase").tokenId;
const bobTokenId = normalizeName("bob", "sepbase").tokenId;

async function draftArtifact() {
  return readFile(
    new URL("../../../apps/web/public/deployment-manifest.v3.json", import.meta.url),
    "utf8",
  );
}

async function verifiedContext(options: {
  primaryName?: string;
  resolvedAddress?: string;
  receiptBlock?: bigint;
  listingDeadline?: bigint;
  failStatusOf?: boolean;
} = {}) {
  const manifest = parseV3SuiteManifest(JSON.parse(await draftArtifact()) as unknown);
  manifest.releaseStatus = "candidate";
  manifest.deployment.blockNumber = "80";
  manifest.multicall3.blockCreated = 1;
  manifest.migration.startsAt = "100";
  manifest.migration.endsAt = "300";
  const contracts = {} as V3SuiteContext["contracts"];
  V3_SUITE_MODULE_KEYS.forEach((key, index) => {
    const address = getAddress(`0x${(index + 3).toString(16).padStart(2, "0").repeat(20)}`);
    manifest.contracts[key].address = address;
    contracts[key] = {
      address,
      abi: (key === "registry"
        ? chainNameRegistryV3Abi
        : key === "marketplace"
          ? chainNameMarketplaceV3Abi
          : key === "resolver"
            ? chainNameResolverV3Abi
            : key === "migration"
              ? chainNameMigrationV3Abi
          : []) as Abi,
    };
  });
  manifest.suiteReleaseId = await calculateV3SuiteReleaseId(manifest);
  const readContract = vi.fn(async (request: { functionName: string; blockNumber?: bigint; args?: readonly unknown[] }) => {
    switch (request.functionName) {
      case "primaryNameOf": return options.primaryName ?? "alice.sepbase";
      case "statusOf": {
        if (options.failStatusOf) throw new Error("RPC down");
        return 1;
      }
      case "isAvailable": return false;
      case "reservedLabels": return false;
      case "transferNonce": return 1n;
      case "expiresAt": return 2_000_000_000n;
      case "migrationPaused": return false;
      case "migrationStartsAt": return 100n;
      case "migrationEndsAt": return 300n;
      case "sourceChainId": return 84_532n;
      case "legacyRegistry": return legacyRegistry;
      case "isReserved": return true;
      case "addr": return options.resolvedAddress ?? account;
      case "resolvedAddress": return account;
      case "ownerOf": return account;
      case "balanceOf": return 2n;
      case "tokenOfOwnerByIndex": return request.args?.[1] === 0n ? aliceTokenId : bobTokenId;
      case "labelOf": return request.args?.[0] === aliceTokenId ? "alice" : "bob";
      case "referralBalance": return 50n;
      case "claimableBalance": return 70n;
      case "listings": return [account, 500n, options.listingDeadline ?? 150n, 1n, 2n, 0];
      case "getApproved": return zeroAddress;
      case "isApprovedForAll": return false;
      case "marketplaceFeeBps": return 0;
      default: throw new Error(`Unexpected read ${request.functionName}`);
    }
  });
  const publicClient = {
    getBlockNumber: vi.fn(async () => 100n),
    getBlock: vi.fn(async () => ({ timestamp: 200n })),
    readContract,
    waitForTransactionReceipt: vi.fn(async () => ({
      status: "success",
      blockNumber: options.receiptBlock ?? 101n,
    })),
    getTransaction: vi.fn(async () => { throw new Error("not needed"); }),
  } as unknown as PublicClient;
  const context: V3SuiteContext = {
    manifest,
    origin: new URL("https://names.example/deployment-manifest.v3.json"),
    chain: {} as Chain,
    publicClient,
    contracts,
    verificationBlockNumber: 90n,
  };
  return {
    client: await createSepbaseV3ClientFromVerifiedContext(context),
    readContract,
    publicClient,
  };
}

describe("v3 client safety primitives", () => {
  it("matches the controller's fixed committed-attestation hash vector", () => {
    expect(hashV3NormalizationAttestation({
      validUntil: 1_800_007_200n,
      signature: "0x3d008b668f0bc8d95a592a1ec3f919b55800e515a181de47966828abc178e6497babe2cbabf27761f946cec48303ed7ceb89bf0ee4a186ebfbb0db0cdc9ade171c",
    })).toBe("0xdd0e8abe69a0abd42f71f62a088325874e059357e934f2a2b5e4a09f1c809e69");
  });

  it("rejects normalization signatures that are not exactly 65 bytes", () => {
    expect(() => hashV3NormalizationAttestation({
      validUntil: 1_800_007_200n,
      signature: `0x${"11".repeat(64)}`,
    })).toThrow(/65-byte/i);
  });

  it("refuses to construct an operational client from the address-free draft", async () => {
    const manifest = parseV3SuiteManifest(JSON.parse(await draftArtifact()) as unknown);
    manifest.releaseStatus = "draft";
    for (const key of V3_SUITE_MODULE_KEYS) {
      manifest.contracts[key].address = null;
      manifest.contracts[key].runtimeCodeHash = null;
    }
    manifest.normalization.attestor = null;
    manifest.wiring.suiteConfigured = false;
    manifest.deployment = {
      blockNumber: null,
      deployedAt: null,
      transactionHashes: [],
      owner: null,
      treasury: null,
    };
    manifest.migration.startsAt = null;
    manifest.migration.endsAt = null;
    manifest.gitCommit = null;
    manifest.suiteReleaseId = await calculateV3SuiteReleaseId(manifest);
    await expect(createSepbaseV3Client({
      manifestUrl: "https://names.example/deployment-manifest.v3.json",
      fetcher: async () => new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    })).rejects.toBeInstanceOf(NotDeployedError);
  });

  it("verifies primary, lifecycle, owner, and forward address at one block", async () => {
    const { client, readContract } = await verifiedContext();
    await expect(client.verifyAddress(account)).resolves.toEqual({
      address: account,
      name: "alice.sepbase",
      verified: true,
      reason: null,
      blockNumber: 100n,
    });
    expect(readContract.mock.calls.every(([request]) => request.blockNumber === 100n)).toBe(true);
  });

  it("returns a typed forward-mismatch reason without mixing blocks", async () => {
    const { client } = await verifiedContext({ resolvedAddress: recipient });
    await expect(client.verifyAddress(account, 123n)).resolves.toMatchObject({
      verified: false,
      reason: "forward-mismatch",
      blockNumber: 123n,
    });
  });

  it("returns bounded owned names and account balances from one pinned block", async () => {
    const { client, readContract } = await verifiedContext();
    await expect(client.getOwnedNames(account, 0n, 2)).resolves.toMatchObject({
      total: 2n,
      nextCursor: 2n,
      blockNumber: 100n,
      items: [
        { label: "alice", tokenId: aliceTokenId, owner: account, blockNumber: 100n },
        { label: "bob", tokenId: bobTokenId, owner: account, blockNumber: 100n },
      ],
    });
    await expect(client.getAccountBalances(account, 120n)).resolves.toMatchObject({
      account,
      referralRewards: 50n,
      marketplaceClaimable: 70n,
      primary: { name: "alice.sepbase", verified: true, blockNumber: 120n },
      blockNumber: 120n,
    });
    expect(readContract.mock.calls.every(([request]) => request.blockNumber === 100n || request.blockNumber === 120n))
      .toBe(true);
  });

  it("binds unsigned plans to the suite and rejects historical reconciliation", async () => {
    const { client, publicClient } = await verifiedContext({ receiptBlock: 100n });
    const plan = await client.prepareTransfer({ owner: account, recipient, tokenId: 1n });
    expect(plan).toMatchObject({
      suiteReleaseId: client.manifest.suiteReleaseId,
      chainId: client.manifest.chainId,
      blockNumber: 100n,
    });
    expect(() => client.assertTransactionPlan({
      ...plan,
      suiteReleaseId: `sha256:${"00".repeat(32)}`,
    })).toThrow(/another or unverified/i);
    await expect(client.reconcileTransaction(
      plan,
      `0x${"44".repeat(32)}`,
    )).rejects.toThrow(/predates/i);
    expect(publicClient.getTransaction).not.toHaveBeenCalled();
  });

  it("prepares permissionless cleanup only for a block-pinned stale listing", async () => {
    const { client } = await verifiedContext();
    await expect(client.prepareBuy({ buyer: recipient, tokenId: aliceTokenId }))
      .rejects.toMatchObject({ code: "LISTING_NOT_ACTIVE" });
    await expect(client.prepareInvalidateListing({ caller: recipient, tokenId: aliceTokenId }))
      .resolves.toMatchObject({
        expectedSender: recipient,
        functionName: "invalidateListing",
        blockNumber: 100n,
      });

    const unavailable = await verifiedContext({ listingDeadline: 1_000n, failStatusOf: true });
    await expect(unavailable.client.prepareInvalidateListing({ caller: recipient, tokenId: aliceTokenId }))
      .rejects.toMatchObject({ code: "RPC_UNAVAILABLE" });
  });

  it("prepares least-authority per-token marketplace approval", async () => {
    const { client } = await verifiedContext();
    await expect(client.prepareMarketplaceApproval({ owner: account, tokenId: aliceTokenId }))
      .resolves.toMatchObject({
        expectedSender: account,
        functionName: "approve",
        value: 0n,
        blockNumber: 100n,
      });
  });

  it("prepares an account-scoped primary-name clear without requiring a token", async () => {
    const { client } = await verifiedContext();
    await expect(client.prepareClearPrimary({ owner: account })).resolves.toMatchObject({
      expectedSender: account,
      functionName: "clearPrimaryName",
      value: 0n,
      blockNumber: 100n,
    });
  });

  it("does not prepare a listing that cannot pass marketplace approval", async () => {
    const { client } = await verifiedContext();
    await expect(client.prepareList({
      seller: account,
      tokenId: aliceTokenId,
      price: 500n,
      deadline: 1_000n,
    })).rejects.toMatchObject({ code: "MARKETPLACE_APPROVAL_REQUIRED" });
  });

  it("requires exact historical v2 ASCII bytes for migration plans", async () => {
    const { client } = await verifiedContext();
    const base = {
      caller: account,
      recipient,
      expectedLegacyOwner: account,
      importLegacyResolution: false,
    } as const;

    for (const legacyLabel of ["Alice", "alice.sepbase", " alice", "alice--one", "é"] as const) {
      await expect(client.prepareMigrationClaim({ ...base, legacyLabel }))
        .rejects.toMatchObject({ code: "INVALID_INPUT" });
    }

    const plan = await client.prepareMigrationClaim({ ...base, legacyLabel: "alice-one" });
    expect(plan).toMatchObject({
      expectedSender: account,
      functionName: "claim",
      blockNumber: 100n,
    });
    expect(decodeFunctionData({ abi: chainNameMigrationV3Abi, data: plan.data })).toMatchObject({
      functionName: "claim",
      args: ["alice-one", recipient, account, false, zeroAddress],
    });
  });

  it("reads migration eligibility from one verified block without treating owner mismatch as eligible", async () => {
    const { client, readContract } = await verifiedContext();
    await expect(client.getMigrationEligibility({ account, legacyLabel: "alice" }, 100n))
      .resolves.toMatchObject({
        account,
        label: "alice",
        blockNumber: 100n,
        blockTimestamp: 200n,
        sourceChainId: 84_532n,
        legacyRegistry,
        phase: "open",
        legacyStatus: "active",
        legacyOwner: account,
        legacyResolution: account,
        reserved: true,
        eligible: true,
        reason: null,
      });
    expect(readContract.mock.calls.every(([request]) => request.blockNumber === 100n)).toBe(true);

    await expect(client.getMigrationEligibility({ account: recipient, legacyLabel: "alice" }, 100n))
      .resolves.toMatchObject({ eligible: false, reason: "owner-mismatch" });
  });
});
