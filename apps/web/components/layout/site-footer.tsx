import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest } from "@/lib/deployment-manifest";
import styles from "./site-layout.module.css";

export function SiteFooter() {
  const wordmark = projectConfig.brand.shortName.split("/");
  return (
    <footer className={styles.footer}>
      <div className={styles.footerRail}>
        <span>{projectConfig.brand.shortName} / DIRECTORY</span>
        <span>{projectConfig.chain.name.toUpperCase()} / {projectConfig.chain.id}</span>
      </div>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <div className={styles.footerWordmark}>
            {wordmark.map((part) => <span key={part}>{part}</span>)}
          </div>
          <p className={styles.footerMotto}>{projectConfig.brand.motto}</p>
        </div>
        <div className={`${styles.footerFact} ${styles.footerNetwork}`}>
          <span className={styles.footerIndex}>01</span>
          <p className={styles.footerLabel}>NETWORK</p>
          <strong>{projectConfig.chain.name}</strong>
          <span>{projectConfig.chain.id}</span>
        </div>
        <div className={`${styles.footerFact} ${styles.footerSettlement}`}>
          <span className={styles.footerIndex}>02</span>
          <p className={styles.footerLabel}>SETTLEMENT</p>
          <strong>{deploymentManifest.settlement.symbol}</strong>
          <span>{deploymentManifest.settlement.kind.toUpperCase()}</span>
        </div>
        <nav className={styles.footerLinks} aria-label="Developer resources">
          <span className={styles.footerIndex}>03</span>
          <p className={styles.footerLabel}>RESOURCES</p>
          <Link href={projectConfig.integration.docsPath}>
            <span>Docs</span><ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <a href={projectConfig.integration.wellKnownPath}>
            <span>Manifest</span><ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <a href="/llms.txt">
            <span>llms.txt</span><ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <Link href="/security">
            <span>Security</span><ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/privacy">
            <span>Privacy</span><ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </div>
      <div className={styles.disclaimer}>
        <span>Independent {projectConfig.chain.testnet ? "testnet " : ""}project. Not an official {projectConfig.chain.name} naming service.</span>
        <span>PROTOCOL / {deploymentManifest.contractVersion}</span>
      </div>
    </footer>
  );
}
