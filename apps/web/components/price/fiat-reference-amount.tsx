import { deploymentManifest } from "@/lib/deployment-manifest";
import { formatFiatReferenceAmount } from "@/lib/fiat-reference";
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
  if (!formatted || !deploymentManifest.referenceFiat) return null;
  return (
    <small className={`${styles.reference}${className ? ` ${className}` : ""}`}>
      ~ {formatted} reference / {deploymentManifest.referenceFiat.asOf}
    </small>
  );
}
