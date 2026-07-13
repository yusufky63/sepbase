import {
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
} from "viem";
import type {
  SepbaseV3Client,
  V3AccountBalances,
  V3NameRecord,
  V3OwnedNamePage,
  V3SuiteManifest,
  V3TransactionPlan,
} from "@sepbase/sdk";
import { assertLegacyV2MigrationLabel } from "@sepbase/sdk";

export type V3AccountTab = "names" | "referrals" | "listings";

export type V3AccountSnapshot = {
  names: V3OwnedNamePage;
  balances: V3AccountBalances;
  blockNumber: bigint;
};

export type V3AccountAction =
  | { kind: "renew"; tokenId: bigint; durationYears: 1 | 2 | 3 | 4 | 5 }
  | { kind: "set-address"; label: string; target: Address }
  | { kind: "set-text"; label: string; key: string; value: string }
  | { kind: "set-primary"; tokenId: bigint }
  | { kind: "clear-primary" }
  | { kind: "transfer"; tokenId: bigint; recipient: Address }
  | { kind: "claim-referral"; recipient: Address }
  | { kind: "claim-marketplace"; recipient: Address }
  | {
    kind: "migrate";
    legacyLabel: string;
    recipient: Address;
    expectedLegacyOwner: Address;
    importLegacyResolution: boolean;
    expectedLegacyResolution?: Address;
  };

export async function loadV3AccountSnapshot(
  client: SepbaseV3Client,
  account: Address,
  cursor = 0n,
  limit = 12,
): Promise<V3AccountSnapshot> {
  const latestBlockNumber = await client.publicClient.getBlockNumber();
  const confirmationDepth = BigInt(client.manifest.requiredConfirmations - 1);
  if (latestBlockNumber < confirmationDepth) throw new Error("V3_ACCOUNT_CONFIRMATION_FLOOR");
  const blockNumber = latestBlockNumber - confirmationDepth;
  const [names, balances] = await Promise.all([
    client.getOwnedNames(account, cursor, limit, blockNumber),
    client.getAccountBalances(account, blockNumber),
  ]);
  if (names.blockNumber !== blockNumber || balances.blockNumber !== blockNumber) {
    throw new Error("V3_ACCOUNT_BLOCK_MISMATCH");
  }
  return { names, balances, blockNumber };
}

export function prepareV3AccountAction(
  client: SepbaseV3Client,
  account: Address,
  action: V3AccountAction,
): Promise<V3TransactionPlan> {
  switch (action.kind) {
    case "renew":
      return client.prepareRenew({
        owner: account,
        tokenId: action.tokenId,
        durationYears: action.durationYears,
      });
    case "set-address":
      return client.prepareSetAddress({ owner: account, label: action.label, target: action.target });
    case "set-text":
      return client.prepareSetText({
        owner: account,
        label: action.label,
        key: action.key,
        value: action.value,
      });
    case "set-primary":
      return client.prepareSetPrimary({ owner: account, tokenId: action.tokenId });
    case "clear-primary":
      return client.prepareClearPrimary({ owner: account });
    case "transfer":
      return client.prepareTransfer({
        owner: account,
        recipient: action.recipient,
        tokenId: action.tokenId,
        safe: true,
      });
    case "claim-referral":
      return client.prepareReferralClaim({ account, recipient: action.recipient });
    case "claim-marketplace":
      return client.prepareMarketplaceClaim({ account, recipient: action.recipient });
    case "migrate":
      return client.prepareMigrationClaim({
        caller: account,
        legacyLabel: action.legacyLabel,
        recipient: action.recipient,
        expectedLegacyOwner: action.expectedLegacyOwner,
        importLegacyResolution: action.importLegacyResolution,
        ...(action.expectedLegacyResolution === undefined
          ? {}
          : { expectedLegacyResolution: action.expectedLegacyResolution }),
      });
  }
}

export function validateV3MigrationLabel(value: string) {
  try {
    return { label: assertLegacyV2MigrationLabel(value), error: null };
  } catch {
    return {
      label: null,
      error: "Enter the exact 1-32 character lowercase ASCII v2 label without a suffix.",
    };
  }
}

export function validateV3Recipient(
  value: string,
  manifest: V3SuiteManifest,
): { address: Address | null; error: string | null } {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return { address: null, error: "Enter a valid EVM address." };
  const address = getAddress(trimmed);
  if (address === zeroAddress) return { address: null, error: "The zero address cannot receive this asset." };
  if (Object.values(manifest.contracts).some((contract) => contract.address === address)) {
    return { address: null, error: "A V3 suite contract cannot be the recipient." };
  }
  return { address, error: null };
}

export function validateV3AddressRecord(value: string) {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return { address: null, error: "Enter a valid EVM address." };
  return { address: getAddress(trimmed), error: null };
}

export function validateV3TextRecord(key: string, value: string) {
  const keyBytes = new TextEncoder().encode(key).byteLength;
  const valueBytes = new TextEncoder().encode(value).byteLength;
  if (keyBytes === 0) return "Text record key is required.";
  if (keyBytes > 64) return "Text record key exceeds 64 UTF-8 bytes.";
  if (valueBytes > 512) return "Text record value exceeds 512 UTF-8 bytes.";
  return null;
}

export function v3PrimaryPermission(record: V3NameRecord, account: Address) {
  if (record.status !== "active" && record.status !== "grace") {
    return { allowed: false, reason: "Only an active or grace-period name can be primary." };
  }
  if (record.owner?.toLowerCase() !== account.toLowerCase()) {
    return { allowed: false, reason: "The connected wallet is not the current owner." };
  }
  if (record.resolvedAddress?.toLowerCase() !== account.toLowerCase()) {
    return { allowed: false, reason: "Set the forward address to this wallet before setting primary." };
  }
  return { allowed: true, reason: null };
}

export function v3AccountTabIndexForKey(key: string, index: number, count: number) {
  if (count <= 0) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
