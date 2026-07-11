import { deploymentManifest } from "@/lib/deployment-manifest";
import { formatSettlementAmount } from "@/lib/settlement";
import { FiatReferenceAmount } from "./fiat-reference-amount";
import styles from "./price.module.css";

type SettlementAmountProps = {
  amountBaseUnits: bigint;
  className?: string | undefined;
  showFiat?: boolean | undefined;
};

export function SettlementAmount({
  amountBaseUnits,
  className,
  showFiat = true,
}: SettlementAmountProps) {
  return (
    <span className={`${styles.amount}${className ? ` ${className}` : ""}`}>
      <span>{formatSettlementAmount(amountBaseUnits, deploymentManifest.settlement.decimals)} {deploymentManifest.settlement.symbol}</span>
      {showFiat ? <FiatReferenceAmount amountBaseUnits={amountBaseUnits} /> : null}
    </span>
  );
}
