import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeName, type SepbaseV3Client } from "@sepbase/sdk";
import type { Address } from "viem";
import {
  createV3RegistrationFlowController,
  type V3RegistrationFlowController,
  type V3RegistrationTransactionAdapter,
} from "@/lib/v3-registration-flow";
import { V3RegistrationPanel } from "./v3-registration-panel";

const payer = "0x1000000000000000000000000000000000000001" as Address;
const recipient = "0x2000000000000000000000000000000000000002" as Address;

afterEach(cleanup);

function controller() {
  const client = {
    manifest: {
      releaseStatus: "candidate",
      suiteReleaseId: `sha256:${"a".repeat(64)}`,
      chainId: 84_532,
      suffix: "sepbase",
      requiredConfirmations: 2,
      nameRules: { minCodepoints: 1, maxCodepoints: 32, maxUtf8Bytes: 96 },
      normalization: {
        profileId: "ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47",
        profileHash: `0x${"bb".repeat(32)}`,
        attestor: "0x3000000000000000000000000000000000000003",
      },
      contracts: { controller: { address: "0x4000000000000000000000000000000000000004" } },
      commitment: { minAgeSeconds: "60", maxAgeSeconds: "1000" },
      settlement: { kind: "erc20", tokenAddress: "0x5000000000000000000000000000000000000005", decimals: 6, symbol: "USDC" },
    },
    normalize: (input: string) => normalizeName(input, "sepbase", { maxUtf8Bytes: 96 }),
  } as unknown as SepbaseV3Client;
  const transactions = {
    account: payer,
    chainId: 84_532,
    getWalletContext: vi.fn(),
    getChainTimestamp: vi.fn(),
    getBlockTimestamp: vi.fn(),
    readAllowance: vi.fn(),
    simulate: vi.fn(),
    send: vi.fn(),
    waitForReceipt: vi.fn(),
  } as unknown as V3RegistrationTransactionAdapter;
  return createV3RegistrationFlowController({ client, transactions, storage: null });
}

describe("V3RegistrationPanel", () => {
  it("provides keyboard-native canonical review and accessible status without exposing a secret", async () => {
    const user = userEvent.setup();
    render(
      <V3RegistrationPanel
        controller={controller()}
        durationYears={1}
        payer={payer}
        recipient={recipient}
        initialName="Alice"
        initialization={{ addressRecord: recipient, textRecords: [] }}
        quoteAmount={500n}
        quoteStatus="ready"
        onDurationYearsChange={vi.fn()}
      />,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "1Y" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Review name" }));
    expect(screen.getByRole("status")).toHaveTextContent("Confirm the final spelling");
    await user.click(screen.getByRole("button", { name: /Use "alice"/ }));
    expect(screen.getByRole("status")).toHaveTextContent("ready for its secure availability check");
    expect(document.body).not.toHaveTextContent(/commitment secret:|0x42{32}/i);
  });

  it("removes payer/recipient self-referrals before canonical review and lets the user clear attribution", async () => {
    const user = userEvent.setup();
    const onClearReferral = vi.fn();
    const flow = controller();
    render(
      <V3RegistrationPanel
        controller={flow}
        durationYears={1}
        payer={payer}
        recipient={recipient}
        initialName="alice"
        referrer={payer}
        onClearReferral={onClearReferral}
        initialization={{ addressRecord: recipient, textRecords: [] }}
        quoteAmount={500n}
        quoteStatus="ready"
        onDurationYearsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("cannot refer itself");
    await user.click(screen.getByRole("button", { name: "Review name" }));
    expect(flow.getSnapshot().draft?.referrer).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClearReferral).toHaveBeenCalledOnce();
  });

  it("consumes a scoped referral only after the flow reports a completed reveal", async () => {
    const referrer = "0x6000000000000000000000000000000000000006" as Address;
    const snapshot = {
      stage: "complete" as const,
      draft: {
        rawInput: "alice",
        payer,
        recipient,
        durationYears: 1 as const,
        referrer,
        initialization: { addressRecord: recipient, textRecords: [] },
      },
      normalized: null,
      canonicalConfirmed: true,
      attestation: null,
      journal: null,
      session: null,
      readiness: null,
      transactionHash: null,
      error: null,
    };
    const completedController = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    } as unknown as V3RegistrationFlowController;
    const onReferralConsumed = vi.fn();
    render(
      <V3RegistrationPanel
        controller={completedController}
        durationYears={1}
        payer={payer}
        recipient={recipient}
        initialName="alice"
        referrer={referrer}
        onReferralConsumed={onReferralConsumed}
        initialization={{ addressRecord: recipient, textRecords: [] }}
        quoteAmount={500n}
        quoteStatus="ready"
        onDurationYearsChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(onReferralConsumed).toHaveBeenCalledOnce());
  });
});
