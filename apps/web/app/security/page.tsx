import type { Metadata } from "next";
import Link from "next/link";
import { projectConfig } from "@/config/project.config";
import styles from "../legal.module.css";

const privateAdvisoryUrl = "https://github.com/yusufky63/sepbase/security/advisories/new";

export const metadata: Metadata = {
  title: "Security",
  description: `Security boundaries and responsible disclosure for ${projectConfig.brand.name}.`,
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <section className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.hero}>
          <span>SECURITY / RESPONSIBLE DISCLOSURE</span>
          <h1>Verify the deployment, preserve transaction guards, and report vulnerabilities privately.</h1>
        </header>
        <div className={styles.content}>
          <section className={styles.section}>
            <h2>REPORTING</h2>
            <p>Use the repository&apos;s <a href={privateAdvisoryUrl} rel="noreferrer">private security advisory form</a>. Include affected version, impact, reproduction steps, and a safe proof of concept. Do not open a public issue before a fix is available.</p>
          </section>
          <section className={styles.section}>
            <h2>NO SECRETS</h2>
            <p>Never submit private keys, seed phrases, signed payment payloads, authenticated RPC URLs, or live credentials. Redact addresses or transaction data only when that does not prevent reproduction.</p>
          </section>
          <section className={styles.section}>
            <h2>TRUST BOUNDARY</h2>
            <p>The contract controls ownership and settlement. The website, SDK, API, and MCP layer are integration surfaces. MCP never signs or broadcasts. Paid x402 uses a separately funded managed keeper only after live/runtime gates pass; the current V3 draft remains fail-closed.</p>
          </section>
          <section className={styles.section}>
            <h2>SAFE TRANSACTIONS</h2>
            <p>Confirm chain, contract, recipient, settlement asset, exact amount, referral rate, marketplace fee, and expected price. Simulate immediately before signing and reconcile state before retrying any economic action.</p>
          </section>
          <section className={styles.section}>
            <h2>TESTNET STATUS</h2>
            <p>{projectConfig.chain.name} is a testnet. Test assets have no guaranteed fiat value. Testnet use does not replace an independent review before a mainnet or meaningful-value launch.</p>
          </section>
          <section className={styles.section}>
            <h2>INTEGRATION GUIDE</h2>
            <p>Machine clients should begin with the <Link href={projectConfig.integration.agentManifestPath}>agent manifest</Link> and <Link href={projectConfig.integration.openApiPath}>OpenAPI contract</Link>, then enforce their own origin and spending allowlists.</p>
          </section>
        </div>
      </div>
    </section>
  );
}
