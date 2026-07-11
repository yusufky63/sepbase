export function protocolErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known: Array<[string, string]> = [
    ["PriceChanged", "The price changed before confirmation. Review the new amount and try again."],
    ["ReferralRateChanged", "The referral rate changed. Review the transaction again."],
    ["MarketplaceFeeChanged", "The marketplace fee changed. Review the seller proceeds again."],
    ["NameNotAvailable", "This name is no longer available."],
    ["NameReserved", "This name is reserved and cannot be registered."],
    ["ProtocolInsolvent", "Economic actions are temporarily disabled because protocol liabilities are not fully covered."],
    ["Deployment configuration mismatch", "Writes are disabled because the deployment manifest does not match the live contract."],
    ["User rejected", "The wallet request was rejected."],
    ["insufficient funds", "The wallet does not have enough native currency for payment and network fees."],
  ];
  return known.find(([needle]) => message.toLowerCase().includes(needle.toLowerCase()))?.[1]
    ?? "The transaction could not be completed. Review the wallet details and try again.";
}
