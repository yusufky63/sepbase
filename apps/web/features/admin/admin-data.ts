import type { Address, Hash, PublicClient } from "viem";
import { projectConfig } from "@/config/project.config";
import { chainNameServiceAbi } from "@/lib/contract/abi.generated";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { shortenAddress } from "@/lib/formatting";
import { formatSettlementAmount } from "@/lib/settlement";

export const adminActivityCategories = [
  "all",
  "names",
  "market",
  "referrals",
  "treasury",
  "configuration",
] as const;

export type AdminActivityCategory = (typeof adminActivityCategories)[number];
export type AdminEventCategory = Exclude<AdminActivityCategory, "all">;

export type AdminActivityItem = {
  id: string;
  eventName: string;
  category: AdminEventCategory;
  title: string;
  description: string;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hash;
  timestamp: bigint | null;
};

export type AdminActivitySummary = {
  totalEvents: number;
  registrations: number;
  renewals: number;
  listings: number;
  sales: number;
  saleVolume: bigint;
  referralRewards: bigint;
  treasuryWithdrawn: bigint;
};

export type AdminActivityData = {
  events: AdminActivityItem[];
  summary: AdminActivitySummary;
  scannedFromBlock: bigint;
  scannedToBlock: bigint;
};

type DecodedContractLog = {
  eventName?: string;
  args?: unknown;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hash | null;
};

const categoryByEvent: Record<string, AdminEventCategory> = {
  NameRegistered: "names",
  NameRenewed: "names",
  NameDataUpdated: "names",
  PrimaryNameChanged: "names",
  Transfer: "names",
  NameListed: "market",
  NameSold: "market",
  ListingCancelled: "market",
  ListingInvalidated: "market",
  SaleProceedsClaimed: "market",
  ReferralAttributed: "referrals",
  ReferralRewardClaimed: "referrals",
  TreasuryWithdrawal: "treasury",
  TreasuryUpdated: "treasury",
  UnexpectedNativeSwept: "treasury",
  UnsupportedTokenRecovered: "treasury",
  AnnualPriceUpdated: "configuration",
  ReferralRewardBpsUpdated: "configuration",
  MarketplaceFeeBpsUpdated: "configuration",
  MarketplacePauseChanged: "configuration",
  RegistrationsPauseChanged: "configuration",
  ReservedLabelUpdated: "configuration",
  MetadataBaseURIUpdated: "configuration",
  OwnershipTransferStarted: "configuration",
  OwnershipTransferred: "configuration",
  SettlementConfigured: "configuration",
};

const activityEventNames = new Set(Object.keys(categoryByEvent));

function eventArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function bigintArg(args: Record<string, unknown>, key: string): bigint {
  const value = args[key];
  return typeof value === "bigint" ? value : 0n;
}

function booleanArg(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

function addressArg(args: Record<string, unknown>, key: string): string {
  const value = stringArg(args, key);
  return value ? shortenAddress(value) : "Unknown address";
}

function settlement(value: bigint): string {
  return `${formatSettlementAmount(value, deploymentManifest.settlement.decimals)} ${deploymentManifest.settlement.symbol}`;
}

function bps(value: unknown): string {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return `${(amount / 100).toFixed(amount % 100 === 0 ? 0 : 2)}%`;
}

function clipped(value: string, limit = 72): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

export function describeAdminEvent(eventName: string, value: unknown): { title: string; description: string } {
  const args = eventArgs(value);
  switch (eventName) {
    case "NameRegistered":
      return { title: "Name registered", description: `${stringArg(args, "label")}.${deploymentManifest.suffix} by ${addressArg(args, "owner")} for ${settlement(bigintArg(args, "price"))}.` };
    case "NameRenewed":
      return { title: "Name renewed", description: `Paid by ${addressArg(args, "payer")} for ${settlement(bigintArg(args, "price"))}.` };
    case "NameDataUpdated":
      return { title: "Name data updated", description: `Owner ${addressArg(args, "owner")} changed resolution or profile data.` };
    case "PrimaryNameChanged":
      return { title: "Primary name changed", description: booleanArg(args, "hasPrimary") ? `${addressArg(args, "account")} selected ${stringArg(args, "fullName")}.` : `${addressArg(args, "account")} cleared the primary name.` };
    case "Transfer":
      return { title: "Name transferred", description: `${addressArg(args, "from")} to ${addressArg(args, "to")}.` };
    case "NameListed":
      return { title: "Name listed", description: `${addressArg(args, "seller")} listed a name for ${settlement(bigintArg(args, "price"))} at ${bps(args.feeBps)} fee.` };
    case "NameSold":
      return { title: "Name sold", description: `${addressArg(args, "seller")} to ${addressArg(args, "buyer")} for ${settlement(bigintArg(args, "price"))}; fee ${settlement(bigintArg(args, "fee"))}.` };
    case "ListingCancelled":
      return { title: "Listing cancelled", description: `Cancelled by ${addressArg(args, "seller")}.` };
    case "ListingInvalidated":
      return { title: "Listing invalidated", description: `Stale listing from ${addressArg(args, "previousSeller")} was removed.` };
    case "SaleProceedsClaimed":
      return { title: "Sale proceeds claimed", description: `${addressArg(args, "seller")} sent ${settlement(bigintArg(args, "amount"))} to ${addressArg(args, "recipient")}.` };
    case "ReferralAttributed":
      return { title: "Referral reward accrued", description: `${addressArg(args, "referrer")} earned ${settlement(bigintArg(args, "reward"))}.` };
    case "ReferralRewardClaimed":
      return { title: "Referral reward claimed", description: `${addressArg(args, "referrer")} sent ${settlement(bigintArg(args, "amount"))} to ${addressArg(args, "recipient")}.` };
    case "TreasuryWithdrawal":
      return { title: "Treasury withdrawn", description: `${settlement(bigintArg(args, "amount"))} sent to ${addressArg(args, "treasury")}.` };
    case "TreasuryUpdated":
      return { title: "Treasury updated", description: `${addressArg(args, "previousTreasury")} to ${addressArg(args, "newTreasury")}.` };
    case "UnexpectedNativeSwept":
      return { title: "Unexpected native balance swept", description: `${settlement(bigintArg(args, "amount"))} sent to treasury.` };
    case "UnsupportedTokenRecovered":
      return { title: "Unsupported token recovered", description: `${addressArg(args, "token")} balance recovered to treasury.` };
    case "AnnualPriceUpdated":
      return { title: "Annual price updated", description: `${settlement(bigintArg(args, "previousPrice"))} to ${settlement(bigintArg(args, "newPrice"))}.` };
    case "ReferralRewardBpsUpdated":
      return { title: "Referral rate updated", description: `${bps(args.previousBps)} to ${bps(args.newBps)}.` };
    case "MarketplaceFeeBpsUpdated":
      return { title: "Market fee updated", description: `${bps(args.previousBps)} to ${bps(args.newBps)}.` };
    case "MarketplacePauseChanged":
      return { title: "Marketplace status changed", description: booleanArg(args, "paused") ? "New listings and purchases paused." : "Marketplace reopened." };
    case "RegistrationsPauseChanged":
      return { title: "Registration status changed", description: booleanArg(args, "paused") ? "New registrations paused." : "Registrations reopened." };
    case "ReservedLabelUpdated":
      return { title: "Reserved name updated", description: `${stringArg(args, "label")}.${deploymentManifest.suffix} ${booleanArg(args, "reserved") ? "reserved" : "released"}.` };
    case "MetadataBaseURIUpdated":
      return { title: "Metadata URL updated", description: clipped(stringArg(args, "newBaseURI")) };
    case "OwnershipTransferStarted":
      return { title: "Ownership transfer started", description: `${addressArg(args, "previousOwner")} nominated ${addressArg(args, "newOwner")}.` };
    case "OwnershipTransferred":
      return { title: "Ownership transferred", description: `${addressArg(args, "previousOwner")} to ${addressArg(args, "newOwner")}.` };
    case "SettlementConfigured":
      return { title: "Settlement configured", description: `${deploymentManifest.settlement.symbol} configured as ${deploymentManifest.settlement.kind.toUpperCase()} settlement.` };
    default:
      return { title: eventName, description: "Contract event recorded." };
  }
}

export function summarizeAdminEvents(logs: readonly DecodedContractLog[]): AdminActivitySummary {
  const summary: AdminActivitySummary = {
    totalEvents: logs.length,
    registrations: 0,
    renewals: 0,
    listings: 0,
    sales: 0,
    saleVolume: 0n,
    referralRewards: 0n,
    treasuryWithdrawn: 0n,
  };
  for (const log of logs) {
    const args = eventArgs(log.args);
    if (log.eventName === "NameRegistered") summary.registrations += 1;
    if (log.eventName === "NameRenewed") summary.renewals += 1;
    if (log.eventName === "NameListed") summary.listings += 1;
    if (log.eventName === "NameSold") {
      summary.sales += 1;
      summary.saleVolume += bigintArg(args, "price");
    }
    if (log.eventName === "ReferralAttributed") summary.referralRewards += bigintArg(args, "reward");
    if (log.eventName === "TreasuryWithdrawal") summary.treasuryWithdrawn += bigintArg(args, "amount");
  }
  return summary;
}

export async function loadAdminActivity(publicClient: PublicClient): Promise<AdminActivityData> {
  if (!protocolAddress || !deploymentManifest.deploymentBlock) throw new Error("Contract deployment is not available.");
  const fromDeployment = BigInt(deploymentManifest.deploymentBlock);
  const latestBlock = await publicClient.getBlockNumber();
  const blockRange = BigInt(projectConfig.admin.logBlockRange);
  const decodedLogs: DecodedContractLog[] = [];

  for (let fromBlock = fromDeployment; fromBlock <= latestBlock; fromBlock += blockRange) {
    const toBlock = fromBlock + blockRange - 1n > latestBlock ? latestBlock : fromBlock + blockRange - 1n;
    const logs = await publicClient.getContractEvents({
      address: protocolAddress as Address,
      abi: chainNameServiceAbi,
      fromBlock,
      toBlock,
      strict: true,
    });
    decodedLogs.push(...(logs as DecodedContractLog[]).filter((log) => log.eventName && activityEventNames.has(log.eventName)));
  }

  decodedLogs.sort((left, right) => {
    const blockOrder = (right.blockNumber ?? 0n) - (left.blockNumber ?? 0n);
    if (blockOrder !== 0n) return blockOrder > 0n ? 1 : -1;
    return (right.logIndex ?? 0) - (left.logIndex ?? 0);
  });

  const events = decodedLogs.flatMap((log): AdminActivityItem[] => {
    if (!log.eventName || log.blockNumber === null || log.logIndex === null || !log.transactionHash) return [];
    const detail = describeAdminEvent(log.eventName, log.args);
    return [{
      id: `${log.transactionHash}:${log.logIndex}`,
      eventName: log.eventName,
      category: categoryByEvent[log.eventName] ?? "configuration",
      title: detail.title,
      description: detail.description,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      timestamp: null,
    }];
  });

  return {
    events,
    summary: summarizeAdminEvents(decodedLogs),
    scannedFromBlock: fromDeployment,
    scannedToBlock: latestBlock,
  };
}
