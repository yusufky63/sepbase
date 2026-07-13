import { Nameplate } from "@/components/nameplate/nameplate";
import { MotionReveal } from "@/components/motion/motion-reveal";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { projectConfig } from "@/config/project.config";
import { NameSearch } from "@/features/search/name-search";
import { annualPriceForLength } from "@/lib/pricing";
import { formatBps } from "@/lib/settlement";
import { v3Manifest } from "@/lib/v3-api";
import homeStyles from "@/app/home.module.css";
import { V3HomeRecentNames } from "./v3-home-recent";
import { V3HomeStats } from "./v3-home-stats";

export function V3Home() {
  const heroNameParts = projectConfig.brand.shortName.split("/");
  const standardAnnualPrice = BigInt(v3Manifest.pricing.annualPriceBaseUnits);
  const pricingTiers = [
    { index: "01", label: "1 CHARACTER", length: 1, multiplier: v3Manifest.pricing.shortNamePriceMultipliers[0] },
    { index: "02", label: "2 CHARACTERS", length: 2, multiplier: v3Manifest.pricing.shortNamePriceMultipliers[1] },
    { index: "03", label: "3 CHARACTERS", length: 3, multiplier: v3Manifest.pricing.shortNamePriceMultipliers[2] },
    {
      index: "04",
      label: `4-${v3Manifest.nameRules.maxCodepoints} CHARACTERS`,
      length: 4,
      multiplier: 1,
    },
  ] as const;
  const allowedYears = v3Manifest.nameRules.allowedYears;
  const termLabel = `${allowedYears[0]}-${allowedYears.at(-1)} years`;
  return (
    <>
      <section className={homeStyles.hero}>
        <div className={homeStyles.heroInner}>
          <div className={homeStyles.heroIndex}>
            <span>{v3Manifest.chainName.toUpperCase()}</span>
            <span>TESTNET / NAMES</span>
          </div>
          <h1>
            {heroNameParts.map((part) => <span key={part}>{part}</span>)}
          </h1>
          <p className={homeStyles.motto}>{projectConfig.brand.motto}</p>
          <div className={homeStyles.heroSearch}>
            <NameSearch />
          </div>
          <div className={homeStyles.protocolFacts}>
            <div>
              <span>STANDARD / 4-{v3Manifest.nameRules.maxCodepoints}</span>
              <strong>
                <SettlementAmount
                  amountBaseUnits={standardAnnualPrice}
                  settlement={v3Manifest.settlement}
                  showFiat={false}
                />
              </strong>
              <small>REGISTRATION PAYMENT</small>
            </div>
            <div>
              <span>TERM</span>
              <strong>{termLabel}</strong>
              <small>CHOOSE WHEN YOU REGISTER</small>
            </div>
            <div>
              <span>REFERRAL</span>
              <strong>{formatBps(v3Manifest.pricing.referralRewardBps)}</strong>
              <small>REWARD FOR THE REFERRER</small>
            </div>
            <div>
              <span>MARKET FEE</span>
              <strong>{formatBps(v3Manifest.pricing.marketplaceFeeBps)}</strong>
              <small>FIXED SALES, OFFERS AND AUCTIONS</small>
            </div>
          </div>
        </div>
      </section>

      <section className={homeStyles.statsSection} aria-labelledby="v3-platform-stats-heading">
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={homeStyles.sectionHeading}>
            <p>02 / PLATFORM</p>
            <h2 id="v3-platform-stats-heading">The registry, at a glance.</h2>
          </div>
          <V3HomeStats />
        </MotionReveal>
      </section>

      <section className={homeStyles.pricingSection}>
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={`${homeStyles.sectionHeading} ${homeStyles.sectionHeadingReverse}`}>
            <p>03 / PRICING</p>
            <h2>Shorter names carry a fixed premium.</h2>
          </div>
          <div className={homeStyles.pricingGrid}>
            {pricingTiers.map((tier) => (
              <div key={tier.index}>
                <span className={homeStyles.tierIndex}>{tier.index}</span>
                <div>
                  <strong>{tier.label}</strong>
                  <small>{tier.multiplier}x standard rate</small>
                </div>
                <SettlementAmount
                  amountBaseUnits={annualPriceForLength(
                    standardAnnualPrice,
                    tier.length,
                    v3Manifest.pricing.shortNamePriceMultipliers,
                  )}
                  settlement={v3Manifest.settlement}
                  showFiat={false}
                />
              </div>
            ))}
          </div>
        </MotionReveal>
      </section>

      <section className={homeStyles.objectSection}>
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={homeStyles.sectionHeading}>
            <p>04 / NAME OBJECT</p>
            <h2>A readable address is also an owned name.</h2>
          </div>
          <Nameplate
            label="alice"
            suffix={v3Manifest.suffix}
            status="IDENTITY / ACTIVE"
          />
        </MotionReveal>
      </section>

      <section className={homeStyles.processSection}>
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={`${homeStyles.sectionHeadingInverse} ${homeStyles.sectionHeadingReverse}`}>
            <p>05 / PROTOCOL</p>
            <h2>Search. Register. Resolve. Trade.</h2>
          </div>
          <div className={homeStyles.processGrid}>
            {[
              ["01", "SEARCH", "Find an available .sepbase name, including supported international characters."],
              ["02", "REGISTER", "Choose a term and complete two protected wallet steps."],
              ["03", "IDENTITY", "Set your address, public profile and primary name."],
              ["04", "MARKET", "List a name, make an offer or join an auction."],
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

      <section className={homeStyles.recentSection}>
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={homeStyles.sectionHeading}>
            <p>06 / RECENT</p>
            <h2>Latest names on Sepbase.</h2>
          </div>
          <V3HomeRecentNames />
        </MotionReveal>
      </section>
    </>
  );
}
