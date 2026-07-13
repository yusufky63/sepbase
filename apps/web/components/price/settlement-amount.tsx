import { deploymentManifest } from "@/lib/deployment-manifest";
import { formatSettlementAmount } from "@/lib/settlement";
import { FiatReferenceAmount } from "./fiat-reference-amount";
import styles from "./price.module.css";

type SettlementAmountProps = {
  amountBaseUnits: bigint;
  className?: string | undefined;
  showFiat?: boolean | undefined;
  settlement?: {
    decimals: number;
    symbol: string;
  } | undefined;
};

export function SettlementAmount({
  amountBaseUnits,
  className,
  showFiat = true,
  settlement,
}: SettlementAmountProps) {
  const asset = settlement ?? deploymentManifest.settlement;
  return (
    <span className={`${styles.amount}${className ? ` ${className}` : ""}`}>
      <span>{formatSettlementAmount(amountBaseUnits, asset.decimals)} {asset.symbol}</span>
      {showFiat && settlement === undefined ? <FiatReferenceAmount amountBaseUnits={amountBaseUnits} /> : null}
    </span>
  );
}
