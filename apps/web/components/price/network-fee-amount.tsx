import { projectConfig } from "@/config/project.config";
import { formatSettlementAmount } from "@/lib/settlement";
import { MarketReferenceAmount } from "./market-reference-amount";
import styles from "./price.module.css";

export function NetworkFeeAmount({ amountBaseUnits }: { amountBaseUnits: bigint }) {
  const nativeCurrency = projectConfig.chain.nativeCurrency;
  return (
    <span className={styles.amount}>
      <span>{formatSettlementAmount(amountBaseUnits, nativeCurrency.decimals)} {nativeCurrency.symbol}</span>
      <MarketReferenceAmount
        amountBaseUnits={amountBaseUnits}
        assetDecimals={nativeCurrency.decimals}
        assetSymbol={nativeCurrency.symbol}
      />
    </span>
  );
}
