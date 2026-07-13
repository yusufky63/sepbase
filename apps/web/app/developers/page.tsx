import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { projectConfig } from "@/config/project.config";
import { CodeBlock, ExampleTabs } from "@/features/developer-docs/code-block";
import { V3IntegrationLab } from "@/features/v3/v3-integration-lab";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { formatBps } from "@/lib/settlement";
import styles from "./developers.module.css";

export const metadata: Metadata = {
  title: "Developers",
  description: "Manifest-first SDK, ABI, HTTP API, MCP, x402, and contract integration documentation.",
  alternates: { canonical: "/developers" },
  openGraph: { url: "/developers" },
};

const resources = [
  ["DEPLOYMENT MANIFEST", "/deployment-manifest.json", "Runtime chain, contract, asset, and endpoint metadata."],
  ["V3 TARGET MANIFEST", "/deployment-manifest.v3.json", "Draft-only seven-address target, MarketLens, ERC-20 settlement, and ABI checksums; not live."],
  ["WELL-KNOWN MANIFEST", projectConfig.integration.wellKnownPath, "Stable discovery document for other applications."],
  ["AGENT DISCOVERY", projectConfig.integration.agentManifestPath, "MCP tools, x402 routes, and explicit authority boundaries."],
  ["CONTRACT ABI", "/abi/ChainNameService.json", "Canonical JSON ABI with a published checksum."],
  ["OPENAPI", projectConfig.integration.openApiPath, "Machine-readable read API, MCP transport, and default-disabled x402 boundary."],
  ["BLOCKSCOUT HANDOFF", "/integrations/blockscout-bens.md", "BENS prerequisites, semantics, and event mapping."],
  ["LLMS.TXT", "/llms.txt", "Compact integration map for AI-assisted development."],
] as const;

const agentEndpointRows = [
  ["POST", projectConfig.integration.mcpPath, "Stateless MCP Streamable HTTP for public reads and unsigned registration plans."],
  ["POST", "/api/v3/normalization-attestation", "Candidate/live-only, same-origin proxy to a reviewed external normalization issuer; draft releases fail closed."],
  ["GET", projectConfig.integration.x402QuotePath, "Free, short-lived registration quote with the full guarded payment scope."],
  ["POST", projectConfig.integration.x402RegisterPath, "Activation-gated paid V3 route: 402 negotiation, 202 durable workflow, 200 settled replay; current draft returns 503 before payment parsing."],
  ["GET", "/api/x402/registration/status", "Reconcile a durable paid order by paymentIdentifier + planId after timeout; never blindly pay twice."],
] as const;

const endpointRows = [
  ["GET", projectConfig.integration.nameApiPath, "Lifecycle, owner, resolution, profile, and listing."],
  ["GET", projectConfig.integration.resolveApiPath, "Forward resolution for a canonical label."],
  ["GET", projectConfig.integration.reverseApiPath, "Forward-confirmed primary name for an address."],
  ["GET", projectConfig.integration.marketApiPath, "Current validated fixed-price listings."],
  ["GET", "/api/v3/status", "Draft/candidate/live V3 suite, seven contracts, capabilities, wiring, and x402 state."],
  ["GET", "/api/v3/name/{label}", "ENSIP-15 canonical V3 lifecycle, owner, resolution, and availability snapshot."],
  ["GET", "/api/v3/resolve/{label}", "V3 forward address and optional text-record resolution."],
  ["GET", "/api/v3/reverse/{address}", "Forward-confirmed V3 primary name."],
  ["GET", "/api/v3/market", "Block-pinned V3 listing, offer, and auction pages through MarketLens."],
  ["GET", "/api/v3/health", "Controller, marketplace, and suite liability/solvency snapshot."],
  ["GET", "/api/v3/account/{address}", "Block-pinned owned names, referral/proceeds balances, primary identity, and buyer/owner offer pages."],
  ["POST", "/api/v3/normalization-attestation", "Exact ENSIP-15 scope and external attestor signature verification; unavailable while V3 is draft."],
  ["POST", "/api/v3/mcp", "Opt-in V3 MCP reads and unsigned guarded plans; registration accepts no secret or signature."],
  ["GET", `${projectConfig.integration.metadataPath}{tokenId}`, "ERC-721 metadata for a registered token."],
  ["GET", `${projectConfig.integration.imagePath}{tokenId}`, "Deterministic onchain-name image representation."],
] as const;

export default function DevelopersPage() {
  const standardAnnualPrice = BigInt(deploymentManifest.annualPriceBaseUnits);
  const [oneCharacter, twoCharacter, threeCharacter] = deploymentManifest.shortNamePriceMultipliers;
  const manifestUrl = `${projectConfig.siteUrl.replace(/\/$/, "")}${projectConfig.integration.wellKnownPath}`;
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
  const v3SdkExample = `import { createSepbaseV3Client } from "@sepbase/sdk";

// Operational only after releaseStatus becomes candidate/live and every
// address, ABI hash, runtime hash, receipt, VERSION and wiring check passes.
const v3 = await createSepbaseV3Client({
  manifestUrl: "${projectConfig.siteUrl.replace(/\/$/, "")}/deployment-manifest.v3.json",
  allowedManifestOrigins: ["${new URL(projectConfig.siteUrl).origin}"],
  allowedRpcOrigins: ["https://sepolia.base.org"]
});

const name = await v3.getNameRecord("alice");
const listings = await v3.getListings(0n, 24);
const offers = await v3.getGlobalOffers(0n, 24, true);
const auctions = await v3.getAuctions(0n, 24);`;
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
    rewardBps  // expectedReferralRewardBps guard
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
  const agentExample = `# Discover the machine-facing surface
curl "${projectConfig.siteUrl.replace(/\/$/, "")}${projectConfig.integration.agentManifestPath}"

# Quote is free; recipient is always explicit
RECIPIENT="0x<connected-account>"
curl --get "${projectConfig.siteUrl.replace(/\/$/, "")}${projectConfig.integration.x402QuotePath}" \\
  --data-urlencode "label=alice" \\
  --data-urlencode "durationYears=1" \\
  --data-urlencode "recipient=$RECIPIENT"`;

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
            <a href="#v3-lab">02 / V3 lab</a>
            <a href="#identity">03 / Verified identity</a>
            <a href="#http-api">04 / HTTP API</a>
            <a href="#agents">05 / Agents</a>
            <a href="#writes">06 / Writes</a>
            <a href="#model">07 / Protocol model</a>
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
              <p>The SDK, React, and MCP packages are public at exact version <code>0.1.0</code> with npm provenance. V3 deployment-dependent calls still fail closed while the published V3 manifest is an address-free draft.</p>
              <p>Server consumers should set <code>allowedManifestOrigins</code> and <code>allowedRpcOrigins</code>. Never accept either URL directly from untrusted request input.</p>
            </div>
            <div className={styles.codeStack}>
              <CodeBlock code={"pnpm add @sepbase/sdk@0.1.0 @sepbase/react@0.1.0 @sepbase/mcp@0.1.0"} language="Shell" />
              <CodeBlock code={sdkExample} language="TypeScript" />
              <CodeBlock code={v3SdkExample} language="TypeScript" />
            </div>
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

      <section className={styles.section} id="v3-lab">
        <div className={styles.inner}>
          <div className={styles.sectionHeading}>
            <span>02 / V3 INTEGRATION LAB</span>
            <h2>Inspect draft release truth and canonical identity locally.</h2>
          </div>
          <V3IntegrationLab />
        </div>
      </section>

      <section className={styles.section} id="identity">
        <div className={styles.inner}>
          <div className={styles.sectionHeading}><span>03 / VERIFIED IDENTITY</span><h2>Show a name only when both directions still agree.</h2></div>
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
          <div className={styles.sectionHeadingInverse}><span>04 / HTTP API</span><h2>Read {projectConfig.brand.name} without a wallet library.</h2></div>
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

      <section className={styles.section} id="agents">
        <div className={styles.inner}>
          <div className={styles.sectionHeading}><span>05 / AGENTS + x402</span><h2>Discover capabilities first; keep signing authority explicit.</h2></div>
          <div className={styles.twoColumn}>
            <CodeBlock code={agentExample} language="Shell" />
            <div className={styles.rules}>
              <div><span>MCP AUTHORITY</span><p>The remote MCP server can read protocol state and prepare guarded calldata. It never holds a key, signs, or broadcasts.</p></div>
              <div><span>TRANSPORT</span><p>Remote clients use stateless Streamable HTTP. Local agent hosts can run the workspace MCP package over stdio.</p></div>
              <div><span>x402 STATUS</span><p>Source status is <code>activation-gated</code>. Official x402 V2, encrypted CAS, managed signing, chain reconciliation and Workflow continuation are wired; the current V3 draft remains fail-closed until every live/runtime gate is verified.</p></div>
              <div><span>PINNED RUNTIME</span><p>Official x402 packages are exact-pinned at <code>2.18.0</code> and Workflow at <code>4.6.0</code>. Installed source packages are not operational readiness.</p></div>
              <div><span>ASSET SEPARATION</span><p>The V3 Base Sepolia target uses manifest-verified 6-decimal Circle test USDC at <code>0x036C…CF7e</code> on <code>eip155:84532</code> for protocol settlement and x402. Gas remains separate test ETH; neither test asset is assigned fiat value. Live V2 remains native.</p></div>
              <div><span>FUTURE KEEPER</span><p>Any paid handler would be keeper-mediated because the contract requires a guarded call. It requires a separate implementation plus durable payment-ID deduplication, limited funds, monitoring, and reconciliation.</p></div>
            </div>
          </div>
          <div className={`${styles.endpointRows} ${styles.agentEndpoints}`}>
            {agentEndpointRows.map(([method, path, description]) => (
              <div key={path}><span>{method}</span><code>{path}</code><p>{description}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="writes">
        <div className={styles.inner}>
          <div className={styles.sectionHeading}><span>06 / WRITE INTEGRATION</span><h2>Quote first. Preserve every slippage guard.</h2></div>
          <div className={styles.twoColumn}>
            <ExampleTabs examples={[
              { id: "viem", label: "TypeScript / Viem", language: "TypeScript", code: writeExample },
              { id: "wagmi", label: "React / Wagmi", language: "TSX", code: wagmiExample },
              { id: "cast", label: "Foundry / Cast", language: "Shell", code: castExample },
            ]} />
            <div className={styles.rules}>
              <div><span>REGISTER / RENEW</span><p>Pass the current quote as <code>expectedAmount</code>. For ERC-20 settlement, approve that exact base-unit amount first.</p></div>
              <div><span>REFERRALS</span><p>Pass the current reward rate as <code>expectedReferralRewardBps</code>. Attribution is recorded onchain; claims use pull payments.</p></div>
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
          <div className={styles.sectionHeadingBlue}><span>07 / PROTOCOL MODEL</span><h2>Portable across settlement assets, explicit about trust.</h2></div>
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
            <div className={styles.wideModel}><span>V3 TARGET DISCOVERY</span><strong>6 AUTHORITY/STATE + 1 READ-ONLY LENS</strong><p>The pending seven-address release adds a bounded MarketLens. Pages are block-pinned, limited to 50 returned/100 scanned entries, use raw cursors, expose stale offer state, and require authoritative revalidation before writes. This target is not live.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
