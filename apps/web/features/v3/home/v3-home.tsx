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

function formatProtocolDuration(secondsValue: string) {
  const seconds = BigInt(secondsValue);
  if (seconds % 86_400n === 0n) return `${seconds / 86_400n} DAYS`;
  if (seconds % 3_600n === 0n) return `${seconds / 3_600n} HOURS`;
  if (seconds % 60n === 0n) return `${seconds / 60n} MIN`;
  return `${seconds} SEC`;
}

export function V3Home() {
  const heroNameParts = projectConfig.brand.shortName.split("/");
  const standardAnnualPrice = BigInt(v3Manifest.pricing.annualPriceBaseUnits);
  const pricingTiers = [
    { index: "01", label: "1 CODE POINT", length: 1, multiplier: v3Manifest.pricing.shortNamePriceMultipliers[0] },
    { index: "02", label: "2 CODE POINTS", length: 2, multiplier: v3Manifest.pricing.shortNamePriceMultipliers[1] },
    { index: "03", label: "3 CODE POINTS", length: 3, multiplier: v3Manifest.pricing.shortNamePriceMultipliers[2] },
    {
      index: "04",
      label: `4-${v3Manifest.nameRules.maxCodepoints} CODE POINTS`,
      length: 4,
      multiplier: 1,
    },
  ] as const;
  const allowedYears = v3Manifest.nameRules.allowedYears;
  const termLabel = `${allowedYears[0]}-${allowedYears.at(-1)} years`;
  const marketModels = [
    v3Manifest.capabilities.fixedListings ? "fixed listings" : null,
    v3Manifest.capabilities.offers ? "escrowed offers" : null,
    v3Manifest.capabilities.englishAuctions ? "English auctions" : null,
  ].filter((value): value is string => value !== null).join(", ");

  return (
    <>
      <section className={homeStyles.hero}>
        <div className={homeStyles.heroInner}>
          <div className={homeStyles.heroIndex}>
            <span>{v3Manifest.chainName.toUpperCase()}</span>
            <span>V3 / CHAIN {v3Manifest.chainId}</span>
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
              <small>TESTNET ASSET / NO FIAT VALUE IMPLIED</small>
            </div>
            <div>
              <span>NAME RULES</span>
              <strong>ENSIP-15 / UNICODE</strong>
              <small>MAX {v3Manifest.nameRules.maxUtf8Bytes} UTF-8 BYTES</small>
            </div>
            <div>
              <span>REGISTRATION</span>
              <strong>COMMIT → REVEAL</strong>
              <small>
                EARLIEST {formatProtocolDuration(v3Manifest.commitment.minAgeSeconds)} / LATEST {formatProtocolDuration(v3Manifest.commitment.maxAgeSeconds)}
              </small>
            </div>
            <div>
              <span>MARKET FEE</span>
              <strong>{formatBps(v3Manifest.pricing.marketplaceFeeBps)}</strong>
              <small>{termLabel.toUpperCase()} REGISTRATION TERMS</small>
            </div>
          </div>
        </div>
      </section>

      <section className={homeStyles.statsSection} aria-labelledby="v3-platform-stats-heading">
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={homeStyles.sectionHeading}>
            <p>02 / V3 REGISTRY</p>
            <h2 id="v3-platform-stats-heading">Confirmed state, read from the verified suite.</h2>
          </div>
          <V3HomeStats />
        </MotionReveal>
      </section>

      <section className={homeStyles.pricingSection}>
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={`${homeStyles.sectionHeading} ${homeStyles.sectionHeadingReverse}`}>
            <p>03 / V3 PRICING</p>
            <h2>Canonical code points set the short-name premium.</h2>
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
            <h2>One normalized name, one ERC-721 identity and resolver node.</h2>
          </div>
          <Nameplate
            label="alice"
            suffix={v3Manifest.suffix}
            status="V3 / ENSIP-15 NORMALIZED"
          />
        </MotionReveal>
      </section>

      <section className={homeStyles.processSection}>
        <MotionReveal className={homeStyles.sectionInner}>
          <div className={`${homeStyles.sectionHeadingInverse} ${homeStyles.sectionHeadingReverse}`}>
            <p>05 / V3 PROTOCOL</p>
            <h2>Normalize. Commit. Reveal. Resolve. Trade.</h2>
          </div>
          <div className={homeStyles.processGrid}>
            {[
              ["01", "NORMALIZE", "ENSIP-15 canonicalizes Unicode before every hash and signature."],
              ["02", "COMMIT / REVEAL", `Commit first, then reveal after ${formatProtocolDuration(v3Manifest.commitment.minAgeSeconds).toLowerCase()}.`],
              ["03", "IDENTITY", "Set address, multicoin and text records with forward-confirmed primary resolution."],
              ["04", "MARKET", `Trade through ${marketModels || "the manifest-declared market models"}.`],
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
            <p>06 / RECENT V3</p>
            <h2>Bounded registrations, rechecked against current registry state.</h2>
          </div>
          <V3HomeRecentNames />
        </MotionReveal>
      </section>
    </>
  );
}
