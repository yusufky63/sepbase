import { deploymentManifest } from "@/lib/deployment-manifest";
import { formatFiatReferenceAmount } from "@/lib/fiat-reference";
import { MarketReferenceAmount } from "./market-reference-amount";
import styles from "./price.module.css";

type FiatReferenceAmountProps = {
  amountBaseUnits: bigint;
  className?: string | undefined;
};

export function FiatReferenceAmount({ amountBaseUnits, className }: FiatReferenceAmountProps) {
  const formatted = formatFiatReferenceAmount(
    amountBaseUnits,
    BigInt(deploymentManifest.annualPriceBaseUnits),
    deploymentManifest.referenceFiat,
  );
  if (!formatted || !deploymentManifest.referenceFiat) {
    return (
      <MarketReferenceAmount
        amountBaseUnits={amountBaseUnits}
        assetDecimals={deploymentManifest.settlement.decimals}
        assetSymbol={deploymentManifest.settlement.symbol}
        className={className}
      />
    );
  }
  return (
    <small className={`${styles.reference}${className ? ` ${className}` : ""}`}>
      ~ {formatted} reference / {deploymentManifest.referenceFiat.asOf}
    </small>
  );
}
