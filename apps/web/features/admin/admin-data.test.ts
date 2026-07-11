import { describe, expect, it } from "vitest";
import { describeAdminEvent, summarizeAdminEvents } from "./admin-data";

describe("admin event data", () => {
  it("aggregates economic activity in base units", () => {
    const summary = summarizeAdminEvents([
      { eventName: "NameRegistered", args: {}, blockNumber: 1n, logIndex: 0, transactionHash: null },
      { eventName: "NameRenewed", args: {}, blockNumber: 2n, logIndex: 0, transactionHash: null },
      { eventName: "NameListed", args: {}, blockNumber: 3n, logIndex: 0, transactionHash: null },
      { eventName: "NameSold", args: { price: 25n }, blockNumber: 4n, logIndex: 0, transactionHash: null },
      { eventName: "ReferralAttributed", args: { reward: 3n }, blockNumber: 5n, logIndex: 0, transactionHash: null },
      { eventName: "TreasuryWithdrawal", args: { amount: 20n }, blockNumber: 6n, logIndex: 0, transactionHash: null },
    ]);

    expect(summary).toMatchObject({
      totalEvents: 6,
      registrations: 1,
      renewals: 1,
      listings: 1,
      sales: 1,
      saleVolume: 25n,
      referralRewards: 3n,
      treasuryWithdrawn: 20n,
    });
  });

  it("formats settlement-aware event descriptions", () => {
    expect(describeAdminEvent("TreasuryWithdrawal", {
      treasury: "0x1111111111111111111111111111111111111111",
      amount: 500000000000000n,
    })).toEqual({
      title: "Treasury withdrawn",
      description: "0.0005 ETH sent to 0x1111...1111.",
    });
  });
});
