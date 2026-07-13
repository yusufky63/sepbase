import { projectConfig } from "@/config/project.config";
import styles from "./nameplate.module.css";

type NameplateProps = {
  label: string;
  suffix?: string;
  status?: string;
  inverted?: boolean;
};

export function Nameplate({
  label,
  suffix = projectConfig.brand.suffix,
  status = "IDENTITY / ACTIVE",
  inverted = false,
}: NameplateProps) {
  return (
    <div className={`${styles.plate} ${inverted ? styles.inverted : ""}`}>
      <div className={styles.topline}>
        <span>{projectConfig.brand.shortName}</span>
        <span>{projectConfig.chain.name}</span>
      </div>
      <div className={styles.name}>
        <span>{label}</span>
        <span className={styles.suffix}>.{suffix}</span>
      </div>
      <div className={styles.bottomline}>
        <span>{status}</span>
        <span className={styles.registrationMark} aria-hidden="true" />
      </div>
    </div>
  );
}
