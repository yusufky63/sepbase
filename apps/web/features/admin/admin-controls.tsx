"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRightLeft, CircleDollarSign, Database, LockKeyhole, Pause, Play, RotateCcw, Shield, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { formatBps, formatSettlementAmount, parseSettlementAmount } from "@/lib/settlement";
import { useProtocolTransaction } from "@/lib/contract/hooks";
import type { AdminOverviewState } from "./admin-hooks";
import { AdminActionDialog, type AdminAction } from "./admin-action-dialog";
import { parseAdminAddress, parseMetadataBaseURI, parsePercentToBps, parseReservedLabels } from "./admin-validation";
import styles from "./admin-workspace.module.css";

type AdminControlsProps = {
  isOwner: boolean;
  isPendingOwner: boolean;
  overview: AdminOverviewState;
};

export function AdminControls({ isOwner, isPendingOwner, overview }: AdminControlsProps) {
  const transaction = useProtocolTransaction();
  const [action, setAction] = useState<AdminAction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [annualPrice, setAnnualPrice] = useState("");
  const [referralRate, setReferralRate] = useState("");
  const [marketFee, setMarketFee] = useState("");
  const [treasury, setTreasury] = useState("");
  const [metadataBaseURI, setMetadataBaseURI] = useState("");
  const [reservedNames, setReservedNames] = useState("");
  const [ownershipTarget, setOwnershipTarget] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");

  const openAction = (nextAction: AdminAction) => {
    transaction.reset();
    setFormError(null);
    setAction(nextAction);
  };
  const closeAction = () => {
    if (transaction.isPending || transaction.isConfirming) return;
    transaction.reset();
    setAction(null);
  };
  const validate = (operation: () => void) => {
    try {
      setFormError(null);
      operation();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };
  const submit = (event: FormEvent, operation: () => void) => {
    event.preventDefault();
    validate(operation);
  };
  const settlementLabel = deploymentManifest.settlement.symbol;
  const currentPrice = `${formatSettlementAmount(overview.annualPrice, deploymentManifest.settlement.decimals)} ${settlementLabel}`;
  const ownerOnly = !isOwner;

  if (overview.isLoading) return <div className={styles.loadingState} role="status">Loading live contract controls...</div>;
  if (overview.error) return <div className={styles.errorState} role="alert"><AlertTriangle size={20} aria-hidden="true" />Contract controls could not be loaded.</div>;

  return (
    <div className={styles.controls}>
      <div className={styles.permissionStrip} data-enabled={isOwner}>
        <Shield size={18} aria-hidden="true" />
        <div>
          <span>{isOwner ? "OWNER SIGNATURE ENABLED" : isPendingOwner ? "PENDING OWNER ACCESS" : "READ-ONLY VIEWER"}</span>
          <p>{isOwner ? "Contract management actions can be simulated and signed by this wallet." : "Contract management writes remain disabled because the connected wallet is not the live owner."}</p>
        </div>
      </div>

      {formError ? <div className={styles.formError} role="alert"><AlertTriangle size={17} aria-hidden="true" />{formError}</div> : null}

      <section className={styles.controlSection} aria-labelledby="economics-control">
        <header>
          <span>01</span>
          <div><h2 id="economics-control">Economics</h2><p>Update the standard annual rate and protocol percentages.</p></div>
          <CircleDollarSign size={22} aria-hidden="true" />
        </header>
        <div className={styles.controlForms}>
          <form onSubmit={(event) => submit(event, () => {
            const amount = parseSettlementAmount(annualPrice, deploymentManifest.settlement.decimals);
            if (amount === 0n) throw new Error("Annual price must be greater than zero.");
            openAction({
              title: "Update annual price",
              description: "This changes the standard 4-32 character annual rate. Short-name multipliers remain unchanged.",
              confirmLabel: "Update price",
              details: [{ label: "CURRENT", value: currentPrice }, { label: "NEW", value: `${formatSettlementAmount(amount, deploymentManifest.settlement.decimals)} ${settlementLabel}` }],
              write: { functionName: "setAnnualPrice", args: [amount] },
            });
          })}>
            <label htmlFor="admin-annual-price">Annual price / {settlementLabel}</label>
            <div className={styles.inlineControl}>
              <input id="admin-annual-price" inputMode="decimal" value={annualPrice} onChange={(event) => setAnnualPrice(event.target.value)} placeholder={formatSettlementAmount(overview.annualPrice, deploymentManifest.settlement.decimals)} disabled={ownerOnly} />
              <Button variant="secondary" type="submit" disabled={ownerOnly}>Review</Button>
            </div>
            <p>Current: {currentPrice}. Manifest sync required after confirmation.</p>
          </form>
          <form onSubmit={(event) => submit(event, () => {
            const nextBps = parsePercentToBps(referralRate, 2000);
            openAction({
              title: "Update referral rate",
              description: "The new rate applies to future successful registrations.",
              confirmLabel: "Update rate",
              details: [{ label: "CURRENT", value: formatBps(overview.referralRewardBps) }, { label: "NEW", value: formatBps(nextBps) }],
              write: { functionName: "setReferralRewardBps", args: [nextBps] },
            });
          })}>
            <label htmlFor="admin-referral-rate">Referral reward / %</label>
            <div className={styles.inlineControl}>
              <input id="admin-referral-rate" inputMode="decimal" value={referralRate} onChange={(event) => setReferralRate(event.target.value)} placeholder={(overview.referralRewardBps / 100).toString()} disabled={ownerOnly} />
              <Button variant="secondary" type="submit" disabled={ownerOnly}>Review</Button>
            </div>
            <p>Maximum 20%. Manifest sync required after confirmation.</p>
          </form>
          <form onSubmit={(event) => submit(event, () => {
            const nextBps = parsePercentToBps(marketFee, 500);
            openAction({
              title: "Update market fee",
              description: "The fee is captured on new or updated listings and does not rewrite existing listings.",
              confirmLabel: "Update fee",
              details: [{ label: "CURRENT", value: formatBps(overview.marketplaceFeeBps) }, { label: "NEW", value: formatBps(nextBps) }],
              write: { functionName: "setMarketplaceFeeBps", args: [nextBps] },
            });
          })}>
            <label htmlFor="admin-market-fee">Marketplace fee / %</label>
            <div className={styles.inlineControl}>
              <input id="admin-market-fee" inputMode="decimal" value={marketFee} onChange={(event) => setMarketFee(event.target.value)} placeholder={(overview.marketplaceFeeBps / 100).toString()} disabled={ownerOnly} />
              <Button variant="secondary" type="submit" disabled={ownerOnly}>Review</Button>
            </div>
            <p>Maximum 5%. Manifest sync required after confirmation.</p>
          </form>
        </div>
      </section>

      <section className={styles.controlSection} aria-labelledby="availability-control">
        <header>
          <span>02</span>
          <div><h2 id="availability-control">Availability</h2><p>Control registrations, marketplace writes, and reserved names.</p></div>
          <Pause size={22} aria-hidden="true" />
        </header>
        <div className={styles.switchRows}>
          <div>
            <div><strong>New registrations</strong><span data-state={overview.registrationsPaused ? "paused" : "live"}>{overview.registrationsPaused ? "PAUSED" : "LIVE"}</span><p>Renewals remain available while registration is paused.</p></div>
            <Button variant={overview.registrationsPaused ? "primary" : "danger"} icon={overview.registrationsPaused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />} disabled={ownerOnly} onClick={() => openAction({
              title: overview.registrationsPaused ? "Resume registrations" : "Pause registrations",
              description: overview.registrationsPaused ? "New name registrations will reopen." : "New registrations will stop; renewals remain available.",
              confirmLabel: overview.registrationsPaused ? "Resume" : "Pause",
              danger: !overview.registrationsPaused,
              details: [{ label: "CURRENT", value: overview.registrationsPaused ? "Paused" : "Live" }, { label: "NEW", value: overview.registrationsPaused ? "Live" : "Paused" }],
              write: { functionName: "setRegistrationsPaused", args: [!overview.registrationsPaused] },
            })}>{overview.registrationsPaused ? "Resume" : "Pause"}</Button>
          </div>
          <div>
            <div><strong>Marketplace</strong><span data-state={overview.marketplacePaused ? "paused" : "live"}>{overview.marketplacePaused ? "PAUSED" : "LIVE"}</span><p>Claims and listing cleanup remain available while paused.</p></div>
            <Button variant={overview.marketplacePaused ? "primary" : "danger"} icon={overview.marketplacePaused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />} disabled={ownerOnly} onClick={() => openAction({
              title: overview.marketplacePaused ? "Resume marketplace" : "Pause marketplace",
              description: overview.marketplacePaused ? "New listings and purchases will reopen." : "New listings and purchases will stop; claims remain available.",
              confirmLabel: overview.marketplacePaused ? "Resume" : "Pause",
              danger: !overview.marketplacePaused,
              details: [{ label: "CURRENT", value: overview.marketplacePaused ? "Paused" : "Live" }, { label: "NEW", value: overview.marketplacePaused ? "Live" : "Paused" }],
              write: { functionName: "setMarketplacePaused", args: [!overview.marketplacePaused] },
            })}>{overview.marketplacePaused ? "Resume" : "Pause"}</Button>
          </div>
        </div>
        <form className={styles.wideForm} onSubmit={(event) => submit(event, () => {
          const labels = parseReservedLabels(reservedNames, deploymentManifest.suffix);
          const submitting = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const reserved = submitting?.value !== "release";
          openAction({
            title: reserved ? "Reserve names" : "Release reserved names",
            description: `${labels.length} normalized name${labels.length === 1 ? "" : "s"} will be updated in one transaction.`,
            confirmLabel: reserved ? "Reserve names" : "Release names",
            danger: !reserved,
            details: [{ label: "NAMES", value: labels.map((label) => `${label}.${deploymentManifest.suffix}`).join(", ") }, { label: "ACTION", value: reserved ? "Reserve" : "Release" }],
            write: { functionName: "setReservedLabels", args: [labels, reserved] },
          });
        })}>
          <label htmlFor="admin-reserved-names"><Tags size={16} aria-hidden="true" /> Reserved names</label>
          <textarea id="admin-reserved-names" value={reservedNames} onChange={(event) => setReservedNames(event.target.value)} placeholder={`founder.${deploymentManifest.suffix}, support.${deploymentManifest.suffix}`} rows={3} disabled={ownerOnly} />
          <div className={styles.formActions}>
            <Button variant="secondary" type="submit" value="reserve" disabled={ownerOnly}>Reserve</Button>
            <Button variant="quiet" type="submit" value="release" disabled={ownerOnly}>Release</Button>
          </div>
        </form>
      </section>

      <section className={styles.controlSection} aria-labelledby="treasury-control">
        <header>
          <span>03</span>
          <div><h2 id="treasury-control">Treasury</h2><p>Manage the payout address and withdraw only unprotected settlement funds.</p></div>
          <Database size={22} aria-hidden="true" />
        </header>
        <div className={styles.controlForms}>
          <form onSubmit={(event) => submit(event, () => {
            const nextTreasury = parseAdminAddress(treasury, protocolAddress);
            openAction({
              title: "Update treasury",
              description: "Future treasury withdrawals and recovery transfers will use the new address.",
              confirmLabel: "Update treasury",
              danger: true,
              details: [{ label: "CURRENT", value: overview.treasury ?? "Unavailable" }, { label: "NEW", value: nextTreasury }],
              write: { functionName: "setTreasury", args: [nextTreasury] },
            });
          })}>
            <label htmlFor="admin-treasury">Treasury address</label>
            <div className={styles.inlineControl}>
              <input id="admin-treasury" value={treasury} onChange={(event) => setTreasury(event.target.value)} placeholder={overview.treasury ?? "0x..."} disabled={ownerOnly} />
              <Button variant="secondary" type="submit" disabled={ownerOnly}>Review</Button>
            </div>
            <p>Manifest sync required after confirmation.</p>
          </form>
          <div className={styles.actionControl}>
            <span>AVAILABLE TO WITHDRAW</span>
            <strong>{formatSettlementAmount(overview.treasuryAvailableBalance, deploymentManifest.settlement.decimals)} {settlementLabel}</strong>
            <p>{overview.solvent ? "Referral and seller liabilities remain protected." : "Withdrawal is blocked because liabilities are not fully covered."}</p>
            <Button variant="danger" icon={<CircleDollarSign size={17} aria-hidden="true" />} disabled={ownerOnly || !overview.solvent || overview.treasuryAvailableBalance === 0n} onClick={() => openAction({
              title: "Withdraw treasury balance",
              description: "The entire currently available settlement surplus will be sent to the configured treasury.",
              confirmLabel: "Withdraw all",
              danger: true,
              details: [{ label: "RECIPIENT", value: overview.treasury ?? "Unavailable" }, { label: "AMOUNT", value: `${formatSettlementAmount(overview.treasuryAvailableBalance, deploymentManifest.settlement.decimals)} ${settlementLabel}` }, { label: "PROTECTED", value: `${formatSettlementAmount(overview.totalProtectedLiability, deploymentManifest.settlement.decimals)} ${settlementLabel}` }],
              write: { functionName: "withdrawTreasury" },
            })}>Withdraw all</Button>
          </div>
        </div>
      </section>

      <section className={styles.controlSection} aria-labelledby="contract-control">
        <header>
          <span>04</span>
          <div><h2 id="contract-control">Contract identity</h2><p>Update metadata or begin the two-step ownership transfer.</p></div>
          <LockKeyhole size={22} aria-hidden="true" />
        </header>
        <div className={styles.controlForms}>
          <form onSubmit={(event) => submit(event, () => {
            const nextURI = parseMetadataBaseURI(metadataBaseURI);
            openAction({
              title: "Update metadata URL",
              description: "Wallets and explorers will resolve token metadata from this base URL.",
              confirmLabel: "Update URL",
              details: [{ label: "CURRENT", value: overview.metadataBaseURI }, { label: "NEW", value: nextURI }],
              write: { functionName: "setMetadataBaseURI", args: [nextURI] },
            });
          })}>
            <label htmlFor="admin-metadata-uri">Metadata base URL</label>
            <div className={styles.inlineControl}>
              <input id="admin-metadata-uri" value={metadataBaseURI} onChange={(event) => setMetadataBaseURI(event.target.value)} placeholder={overview.metadataBaseURI} disabled={ownerOnly} />
              <Button variant="secondary" type="submit" disabled={ownerOnly}>Review</Button>
            </div>
            <p>Must be absolute and end with /. Manifest sync required.</p>
          </form>
          <form onSubmit={(event) => submit(event, () => {
            const nextOwner = parseAdminAddress(ownershipTarget, protocolAddress);
            openAction({
              title: "Start ownership transfer",
              description: "The nominated wallet must connect and accept ownership in a second transaction.",
              confirmLabel: "Start transfer",
              danger: true,
              details: [{ label: "CURRENT OWNER", value: overview.owner ?? "Unavailable" }, { label: "PENDING OWNER", value: nextOwner }],
              write: { functionName: "transferOwnership", args: [nextOwner] },
            });
          })}>
            <label htmlFor="admin-ownership-target">New owner address</label>
            <div className={styles.inlineControl}>
              <input id="admin-ownership-target" value={ownershipTarget} onChange={(event) => setOwnershipTarget(event.target.value)} placeholder="0x..." disabled={ownerOnly} />
              <Button variant="danger" type="submit" disabled={ownerOnly}>Review</Button>
            </div>
            <p>Renouncing ownership is disabled by the contract.</p>
          </form>
          {overview.pendingOwner ? (
            <div className={styles.actionControl}>
              <span>PENDING OWNER</span>
              <strong>{overview.pendingOwner}</strong>
              <p>Only this wallet can complete the second ownership step.</p>
              <Button variant="secondary" icon={<ArrowRightLeft size={17} aria-hidden="true" />} disabled={!isPendingOwner} onClick={() => openAction({
                title: "Accept contract ownership",
                description: "The connected pending-owner wallet will become the live contract owner.",
                confirmLabel: "Accept ownership",
                danger: true,
                details: [{ label: "CURRENT OWNER", value: overview.owner ?? "Unavailable" }, { label: "NEW OWNER", value: overview.pendingOwner ?? "Unavailable" }],
                write: { functionName: "acceptOwnership" },
              })}>Accept ownership</Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.controlSection} aria-labelledby="recovery-control">
        <header>
          <span>05</span>
          <div><h2 id="recovery-control">Recovery</h2><p>Recover unrelated assets without touching configured settlement liabilities.</p></div>
          <RotateCcw size={22} aria-hidden="true" />
        </header>
        <div className={styles.controlForms}>
          <form onSubmit={(event) => submit(event, () => {
            const token = parseAdminAddress(recoveryToken, protocolAddress);
            if (deploymentManifest.settlement.tokenAddress?.toLowerCase() === token.toLowerCase()) throw new Error("The configured settlement token cannot be recovered.");
            openAction({
              title: "Recover unsupported token",
              description: "The full balance of this unrelated ERC-20 will be sent to treasury.",
              confirmLabel: "Recover token",
              danger: true,
              details: [{ label: "TOKEN", value: token }, { label: "RECIPIENT", value: overview.treasury ?? "Unavailable" }],
              write: { functionName: "recoverUnsupportedERC20", args: [token] },
            });
          })}>
            <label htmlFor="admin-recovery-token">Unsupported ERC-20 address</label>
            <div className={styles.inlineControl}>
              <input id="admin-recovery-token" value={recoveryToken} onChange={(event) => setRecoveryToken(event.target.value)} placeholder="0x..." disabled={ownerOnly} />
              <Button variant="danger" type="submit" disabled={ownerOnly}>Review</Button>
            </div>
            <p>The configured settlement token is always rejected.</p>
          </form>
          {deploymentManifest.settlement.kind === "erc20" ? (
            <div className={styles.actionControl}>
              <span>UNEXPECTED NATIVE BALANCE</span>
              <strong>{deploymentManifest.nativeCurrency.symbol}</strong>
              <p>Available only for ERC-20 settlement deployments.</p>
              <Button variant="danger" disabled={ownerOnly} onClick={() => openAction({
                title: "Sweep unexpected native balance",
                description: "Forced or mistakenly sent native currency will be transferred to treasury.",
                confirmLabel: "Sweep balance",
                danger: true,
                details: [{ label: "RECIPIENT", value: overview.treasury ?? "Unavailable" }, { label: "ASSET", value: deploymentManifest.nativeCurrency.symbol }],
                write: { functionName: "sweepUnexpectedNative" },
              })}>Sweep native balance</Button>
            </div>
          ) : null}
        </div>
      </section>

      <AdminActionDialog
        action={action}
        transaction={transaction}
        onClose={closeAction}
        onConfirm={() => {
          if (!action) return;
          void transaction.send(action.write);
        }}
      />
    </div>
  );
}
