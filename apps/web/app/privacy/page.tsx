import type { Metadata } from "next";
import Link from "next/link";
import { projectConfig } from "@/config/project.config";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${projectConfig.brand.name} handles public blockchain and browser-local data.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <section className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.hero}>
          <span>PRIVACY / 2026-07-12</span>
          <h1>Public-chain data, local browser state, and explicit network requests.</h1>
        </header>
        <div className={styles.content}>
          <section className={styles.section}>
            <h2>ONCHAIN DATA</h2>
            <p>Names, wallet addresses, ownership, profiles, referrals, listings, proceeds, and transactions written to {projectConfig.chain.name} are public and may be permanent. The admin viewer allowlist does not make blockchain data private.</p>
          </section>
          <section className={styles.section}>
            <h2>NETWORK REQUESTS</h2>
            <p>The site sends public read parameters such as labels, addresses, and block queries to the configured RPC provider. Wallet connection may also use the selected wallet and WalletConnect infrastructure. Those providers apply their own policies.</p>
          </section>
          <section className={styles.section}>
            <h2>LOCAL STORAGE</h2>
            <p>Renewal watches are stored in your browser&apos;s local storage. Short transaction notices use session storage. Referral deep links set a SameSite=Lax cookie containing the referring public wallet address. Clearing site data removes these browser-local records.</p>
          </section>
          <section className={styles.section}>
            <h2>SERVICE DATA</h2>
            <p>This standalone release has no application database or indexer and does not advertise analytics tracking. Hosting and RPC infrastructure may still retain ordinary request, security, and availability logs.</p>
          </section>
          <section className={styles.section}>
            <h2>PAYMENTS AND AGENTS</h2>
            <p>The x402 endpoint is quote-only in this release and does not settle payments. MCP requests are public protocol reads or unsigned transaction preparation; do not send secrets, private keys, or confidential prompts.</p>
          </section>
          <section className={styles.section}>
            <h2>QUESTIONS</h2>
            <p>Review the <Link href="/security">security reporting page</Link> for vulnerability disclosures. Never publish a private key or seed phrase in an issue or support request.</p>
          </section>
        </div>
      </div>
    </section>
  );
}
