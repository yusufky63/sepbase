import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { projectConfig } from "@/config/project.config";
import { CodeBlock, ExampleTabs } from "@/features/developer-docs/code-block";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { formatBps } from "@/lib/settlement";
import styles from "./developers.module.css";

export const metadata: Metadata = {
  title: "Developers",
  description: "Manifest-first SDK, ABI, HTTP API, and contract integration documentation.",
};

const resources = [
  ["DEPLOYMENT MANIFEST", "/deployment-manifest.json", "Runtime chain, contract, asset, and endpoint metadata."],
  ["WELL-KNOWN MANIFEST", projectConfig.integration.wellKnownPath, "Stable discovery document for other applications."],
  ["CONTRACT ABI", "/abi/ChainNameService.json", "Canonical JSON ABI with a published checksum."],
  ["OPENAPI", projectConfig.integration.openApiPath, "Machine-readable read-only HTTP API contract."],
  ["BLOCKSCOUT HANDOFF", "/integrations/blockscout-bens.md", "BENS prerequisites, semantics, and event mapping."],
  ["LLMS.TXT", "/llms.txt", "Compact integration map for AI-assisted development."],
] as const;

const endpointRows = [
  ["GET", projectConfig.integration.nameApiPath, "Lifecycle, owner, resolution, profile, and listing."],
  ["GET", projectConfig.integration.resolveApiPath, "Forward resolution for a canonical label."],
  ["GET", projectConfig.integration.reverseApiPath, "Forward-confirmed primary name for an address."],
  ["GET", projectConfig.integration.marketApiPath, "Current validated fixed-price listings."],
  ["GET", `${projectConfig.integration.metadataPath}{tokenId}`, "ERC-721 metadata for a registered token."],
  ["GET", `${projectConfig.integration.imagePath}{tokenId}`, "Deterministic onchain-name image representation."],
] as const;

export default function DevelopersPage() {
  const standardAnnualPrice = BigInt(deploymentManifest.annualPriceBaseUnits);
  const [oneCharacter, twoCharacter, threeCharacter] = deploymentManifest.shortNamePriceMultipliers;
  const manifestUrl = `${projectConfig.siteUrl.replace(/\/$/, "")}/deployment-manifest.json`;
  const sdkExample = `import { createSepbaseClient } from "@sepbase/sdk";

const sepbase = await createSepbaseClient(
  "${manifestUrl}"
);

const address = await sepbase.resolveName("alice");
const primary = await sepbase.reverseLookup("0xYourAddress");
const quote = await sepbase.quoteName("alice", 1);`;
  const identityExample = `const identity = await sepbase.verifyAddress(
  "0x78de409a6306550882328E2a67160471368387FF"
);

const displayName = identity.verified
  ? identity.primaryName
  : identity.account;

// Name-first verification is also available.
const recipient = await sepbase.verifyName("alice", identity.account);`;
  const reactExample = `import {
  SepbaseIdentity,
  SepbaseProvider
} from "@sepbase/react";

export function AccountName({ address }: { address: string }) {
  return (
    <SepbaseProvider manifestUrl="${manifestUrl}">
      <SepbaseIdentity
        address={address}
        profileBaseUrl="${projectConfig.siteUrl.replace(/\/$/, "")}/name"
      />
    </SepbaseProvider>
  );
}`;
  const writeExample = `const amount = await publicClient.readContract({
  address: manifest.contract,
  abi,
  functionName: "quote",
  args: ["alice", 1]
});

const rewardBps = await publicClient.readContract({
  address: manifest.contract,
  abi,
  functionName: "referralRewardBps"
});

const { request } = await publicClient.simulateContract({
  account: owner,
  address: manifest.contract,
  abi,
  functionName: "register",
  args: [
    "alice",
    1,
    owner,
    referrer,
    amount,    // expectedAmount guard
    rewardBps  // expectedRewardBps guard
  ],
  value: manifest.settlement.kind === "native" ? amount : undefined
});

const hash = await walletClient.writeContract(request);`;
  const wagmiExample = `import { useReadContract } from "wagmi";
import manifest from "./deployment-manifest.json";
import abi from "./ChainNameService.json";

const resolution = useReadContract({
  chainId: manifest.chainId,
  address: manifest.contract!,
  abi,
  functionName: "resolve",
  args: ["alice"]
});`;
  const castExample = `MANIFEST="${manifestUrl}"
CONTRACT=$(curl -fsSL "$MANIFEST" | jq -r .contract)
RPC=$(curl -fsSL "$MANIFEST" | jq -r .rpcUrl)

test "$CONTRACT" != "null" || { echo "Not deployed"; exit 1; }
cast call "$CONTRACT" "resolve(string)(address)" alice --rpc-url "$RPC"`;

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.kicker}>INTEGRATION SURFACE / VERSION {deploymentManifest.contractVersion}</div>
          <div className={styles.titleRow}>
            <h1>BUILD<br /><span>WITH {projectConfig.brand.name}</span></h1>
            <div className={styles.deploymentState}>
              <span>{protocolAddress ? "CONTRACT" : "DEPLOYMENT STATUS"}</span>
              <strong>{protocolAddress ?? `${projectConfig.chain.name.toUpperCase()} DEPLOYMENT PENDING`}</strong>
            </div>
          </div>
          <nav className={styles.jumpNav} aria-label="Developer documentation sections">
            <a href="#quickstart">01 / Quickstart</a>
            <a href="#identity">02 / Verified identity</a>
            <a href="#http-api">03 / HTTP API</a>
            <a href="#writes">04 / Writes</a>
            <a href="#model">05 / Protocol model</a>
          </nav>
        </div>
      </section>

      <section className={styles.section} id="quickstart">
        <div className={styles.inner}>
          <div className={styles.sectionHeading}><span>01 / QUICKSTART</span><h2>Discover configuration before calling the contract.</h2></div>
          <div className={styles.twoColumn}>
            <div className={styles.copy}>
              <p>Start with the deployment manifest. It publishes the current network, contract, pricing rules, asset details, and integration URLs in one place.</p>
              <p>The SDK validates the manifest and ABI before returning reads. The HTTP API exposes the same public name data without requiring a wallet connection.</p>
              <p>The SDK and React integration packages are release-ready in <code>packages/sdk</code> and <code>packages/react</code>, but are not yet published to the public npm registry. Use <code>workspace:*</code> inside this monorepo; the install command applies after the first package release.</p>
            </div>
            <CodeBlock code={`# After the public package release\npnpm add @sepbase/sdk @sepbase/react\n\n${sdkExample}`} language="TypeScript" />
          </div>
          <div className={styles.contractFacts}>
            <div><span>CHAIN</span><strong>{deploymentManifest.chainName} / {deploymentManifest.chainId}</strong></div>
            <div><span>CONTRACT</span><strong>{protocolAddress ?? "Not deployed"}</strong></div>
            <div><span>VERSION</span><strong>{deploymentManifest.contractVersion}</strong></div>
            <div><span>SUFFIX</span><strong>.{deploymentManifest.suffix}</strong></div>
            <div><span>SETTLEMENT</span><strong>{deploymentManifest.settlement.symbol}</strong></div>
            <div><span>DEPLOYMENT BLOCK</span><strong>{deploymentManifest.deploymentBlock ?? "Not deployed"}</strong></div>
          </div>
          <div className={styles.resourceRows}>
            {resources.map(([label, href, description]) => (
              <Link href={href} key={href}>
                <span>{label}</span><code>{href}</code><p>{description}</p><strong>OPEN <ExternalLink size={14} aria-hidden="true" /></strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="identity">
        <div className={styles.inner}>
          <div className={styles.sectionHeading}><span>02 / VERIFIED IDENTITY</span><h2>Show a name only when both directions still agree.</h2></div>
          <div className={styles.twoColumn}>
            <ExampleTabs examples={[
              { id: "sdk-identity", label: "SDK", language: "TypeScript", code: identityExample },
              { id: "react-identity", label: "React", language: "TSX", code: reactExample },
            ]} />
            <div className={styles.rules}>
              <div><span>DISPLAY</span><p>Use the primary name only when <code>verified</code> is true. Otherwise display the checksummed address.</p></div>
              <div><span>SNAPSHOT</span><p>Owner, lifecycle, resolution, primary, and expiry reads are pinned to one block.</p></div>
              <div><span>RECHECK</span><p>Verify again before a payment or other address-sensitive confirmation.</p></div>
              <div><span>REACT FALLBACK</span><p><code>SepbaseIdentity</code> never displays an unverified name and exposes stable loading, verified, unverified, and error states.</p></div>
              <div><span>BLOCKSCOUT</span><p>Explorer-native search requires an external BENS-compatible subgraph and Blockscout configuration. The public handoff document maps the required work without adding an indexer to this dApp.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.inverse}`} id="http-api">
        <div className={styles.inner}>
          <div className={styles.sectionHeadingInverse}><span>03 / HTTP API</span><h2>Read {projectConfig.brand.name} without a wallet library.</h2></div>
          <p className={styles.lead}>The read-only API returns name, profile, resolution, pricing, and market data with the network context needed by another application.</p>
          <div className={styles.endpointRows}>
            {endpointRows.map(([method, path, description]) => (
              <div key={path}><span>{method}</span><code>{path}</code><p>{description}</p></div>
            ))}
          </div>
          <CodeBlock
            inverse
            language="Shell"
            code={`curl "${projectConfig.siteUrl.replace(/\/$/, "")}/api/name/alice?durationYears=1"\n\ncurl "${projectConfig.siteUrl.replace(/\/$/, "")}/api/reverse/0x78de409a6306550882328E2a67160471368387FF"\n\ncurl "${projectConfig.siteUrl.replace(/\/$/, "")}/api/market?cursor=0&limit=24"`}
          />
        </div>
      </section>

      <section className={styles.section} id="writes">
        <div className={styles.inner}>
          <div className={styles.sectionHeading}><span>04 / WRITE INTEGRATION</span><h2>Quote first. Preserve every slippage guard.</h2></div>
          <div className={styles.twoColumn}>
            <ExampleTabs examples={[
              { id: "viem", label: "TypeScript / Viem", language: "TypeScript", code: writeExample },
              { id: "wagmi", label: "React / Wagmi", language: "TSX", code: wagmiExample },
              { id: "cast", label: "Foundry / Cast", language: "Shell", code: castExample },
            ]} />
            <div className={styles.rules}>
              <div><span>REGISTER / RENEW</span><p>Pass the current quote as <code>expectedAmount</code>. For ERC-20 settlement, approve that exact base-unit amount first.</p></div>
              <div><span>REFERRALS</span><p>Pass the current reward rate as <code>expectedRewardBps</code>. Attribution is recorded onchain; claims use pull payments.</p></div>
              <div><span>LIST / UPDATE</span><p>Pass the current market fee as <code>expectedFeeBps</code>. The fee is captured on each listing.</p></div>
              <div><span>BUY</span><p>Pass the displayed listing price as <code>expectedPrice</code>. Seller proceeds remain protected until claimed.</p></div>
              <div><span>REFERRAL DEEP LINK</span><p>Send users to the configured <code>/r/{'{referrer}'}</code> route. Attribution is scoped to schema, chain, and contract.</p></div>
              <div><span>EVENTS / ERRORS</span><p>Index <code>NameRegistered</code>, <code>NameRenewed</code>, <code>ReferralAttributed</code>, <code>NameListed</code>, and <code>NameSold</code>; handle custom errors by machine name.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.blueBand}`} id="model">
        <div className={styles.inner}>
          <div className={styles.sectionHeadingBlue}><span>05 / PROTOCOL MODEL</span><h2>Portable across settlement assets, explicit about trust.</h2></div>
          <div className={styles.modelGrid}>
            <div><span>GAS CURRENCY</span><strong>{deploymentManifest.nativeCurrency.symbol}</strong><p>Used by the connected chain to pay transaction fees.</p></div>
            <div><span>SETTLEMENT</span><strong>{deploymentManifest.settlement.symbol} / {deploymentManifest.settlement.decimals} decimals</strong><p>Native or one standard ERC-20 selected per deployment.</p></div>
            <div>
              <span>STANDARD ANNUAL / 4-32</span>
              <strong><SettlementAmount amountBaseUnits={standardAnnualPrice} /></strong>
              <p><code>quote(label, years)</code> applies the configured length tier in settlement base units.</p>
            </div>
            <div><span>SHORT-NAME PREMIUMS</span><strong>{oneCharacter}x / {twoCharacter}x / {threeCharacter}x</strong><p>Applied respectively to one-, two-, and three-character labels.</p></div>
            <div><span>REFERRAL RATE</span><strong>{formatBps(deploymentManifest.referralRewardBps)}</strong><p>Current reward for a successful registration made through a referral.</p></div>
            <div><span>MARKET FEE</span><strong>{formatBps(deploymentManifest.marketplaceFeeBps)}</strong><p>Applied to new or updated listings, not retroactively changed.</p></div>
            <div className={styles.wideModel}><span>NAME DATA</span><strong>V2 REGISTRY</strong><p>Reads resolve against the deployment published in the manifest.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
