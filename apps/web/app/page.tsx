import { Nameplate } from "@/components/nameplate/nameplate";
import { MotionReveal } from "@/components/motion/motion-reveal";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { projectConfig } from "@/config/project.config";
import { PlatformStats } from "@/features/platform-stats/platform-stats";
import { RecentNames } from "@/features/recent-names/recent-names";
import { NameSearch } from "@/features/search/name-search";
import { deploymentManifest } from "@/lib/deployment-manifest";
import { annualPriceForLength } from "@/lib/pricing";
import { formatBps } from "@/lib/settlement";
import styles from "./home.module.css";

export default function HomePage() {
  const heroNameParts = projectConfig.brand.shortName.split("/");
  const standardAnnualPrice = BigInt(deploymentManifest.annualPriceBaseUnits);
  const pricingTiers = [
    { index: "01", label: "1 CHARACTER", length: 1, multiplier: deploymentManifest.shortNamePriceMultipliers[0] },
    { index: "02", label: "2 CHARACTERS", length: 2, multiplier: deploymentManifest.shortNamePriceMultipliers[1] },
    { index: "03", label: "3 CHARACTERS", length: 3, multiplier: deploymentManifest.shortNamePriceMultipliers[2] },
    { index: "04", label: "4-32 CHARACTERS", length: 4, multiplier: 1 },
  ] as const;

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroIndex}>
            <span>{projectConfig.chain.name.toUpperCase()}</span>
            <span>CHAIN / {projectConfig.chain.id}</span>
          </div>
          <h1>
            {heroNameParts.map((part) => <span key={part}>{part}</span>)}
          </h1>
          <p className={styles.motto}>{projectConfig.brand.motto}</p>
          <div className={styles.heroSearch}>
            <NameSearch />
          </div>
          <div className={styles.protocolFacts}>
            <div>
              <span>STANDARD / 4-32</span>
              <strong><SettlementAmount amountBaseUnits={standardAnnualPrice} /></strong>
            </div>
            <div><span>TERM</span><strong>1-5 years</strong></div>
            <div><span>REFERRAL</span><strong>{formatBps(deploymentManifest.referralRewardBps)}</strong></div>
            <div><span>MARKET FEE</span><strong>{formatBps(deploymentManifest.marketplaceFeeBps)}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.statsSection} aria-labelledby="platform-stats-heading">
        <MotionReveal className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p>02 / PLATFORM</p>
            <h2 id="platform-stats-heading">The registry, at a glance.</h2>
          </div>
          <PlatformStats />
        </MotionReveal>
      </section>

      <section className={styles.pricingSection}>
        <MotionReveal className={styles.sectionInner}>
          <div className={`${styles.sectionHeading} ${styles.sectionHeadingReverse}`}>
            <p>03 / PRICING</p>
            <h2>Shorter names carry a fixed premium.</h2>
          </div>
          <div className={styles.pricingGrid}>
            {pricingTiers.map((tier) => (
              <div key={tier.index}>
                <span className={styles.tierIndex}>{tier.index}</span>
                <div>
                  <strong>{tier.label}</strong>
                  <small>{tier.multiplier}x standard rate</small>
                </div>
                <SettlementAmount
                  amountBaseUnits={annualPriceForLength(
                    standardAnnualPrice,
                    tier.length,
                    deploymentManifest.shortNamePriceMultipliers,
                  )}
                />
              </div>
            ))}
          </div>
        </MotionReveal>
      </section>

      <section className={styles.objectSection}>
        <MotionReveal className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p>04 / NAME OBJECT</p>
            <h2>A readable address is also an owned object.</h2>
          </div>
          <Nameplate label="alice" />
        </MotionReveal>
      </section>

      <section className={styles.processSection}>
        <MotionReveal className={styles.sectionInner}>
          <div className={`${styles.sectionHeadingInverse} ${styles.sectionHeadingReverse}`}>
            <p>05 / PROTOCOL</p>
            <h2>Search. Register. Resolve. Trade.</h2>
          </div>
          <div className={styles.processGrid}>
            {[
              ["01", "SEARCH", "Check whether a name is available."],
              ["02", "REGISTER", "Choose one to five years and confirm in your wallet."],
              ["03", "IDENTITY", "Set an address, public profile, and primary name."],
              ["04", "MARKET", "List and buy names at fixed prices."],
            ].map(([index, title, copy]) => (
              <div key={index}>
                <span>{index}</span>
                <strong>{title}</strong>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </MotionReveal>
      </section>

      <section className={styles.recentSection}>
        <MotionReveal className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p>06 / RECENT</p>
            <h2>Latest names, read from the registry.</h2>
          </div>
          <RecentNames />
        </MotionReveal>
      </section>
    </>
  );
}
