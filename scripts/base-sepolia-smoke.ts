import "./lib/load-env";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseUnits,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { projectConfig } from "../apps/web/config/project.config";
import { chainNameServiceAbi } from "../apps/web/lib/contract/abi.generated";
import manifestJson from "../apps/web/public/deployment-manifest.json";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";

if (!projectConfig.chain.testnet || projectConfig.chain.id !== 84_532) {
  throw new Error("This smoke workflow is restricted to Base Sepolia.");
}
if (projectConfig.settlement.kind !== "native") {
  throw new Error("The Base Sepolia smoke workflow expects native settlement.");
}
if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required.");

const manifest = deploymentManifestSchema.parse(manifestJson);
if (!manifest.contract) throw new Error("The v2 deployment manifest has no contract address.");
const contract = getAddress(manifest.contract);
const transport = http(projectConfig.chain.rpcUrl, { timeout: 20_000, retryCount: 2 });
const publicClient = createPublicClient({ transport });
const owner = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const buyer = privateKeyToAccount(generatePrivateKey());
const referrer = privateKeyToAccount(generatePrivateKey());
const ownerWallet = createWalletClient({ account: owner, transport });
const buyerWallet = createWalletClient({ account: buyer, transport });
const referrerWallet = createWalletClient({ account: referrer, transport });

type Actor = {
  account: PrivateKeyAccount;
  wallet: typeof ownerWallet;
};

const actors = {
  owner: { account: owner, wallet: ownerWallet },
  buyer: { account: buyer, wallet: buyerWallet },
  referrer: { account: referrer, wallet: referrerWallet },
} satisfies Record<string, Actor>;

const contractRequest = { address: contract, abi: chainNameServiceAbi } as const;
const read = <T>(functionName: string, args: readonly unknown[] = []) => publicClient.readContract({
  ...contractRequest,
  functionName,
  args,
} as never) as Promise<T>;
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function eventually<T>(
  label: string,
  operation: () => Promise<T>,
  accepts: (value: T) => boolean = () => true,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const value = await operation();
      if (accepts(value)) return value;
    } catch (error) {
      lastError = error;
    }

    if (attempt < 8) await sleep(2_000);
  }

  throw new Error(`${label} did not converge across Base Sepolia RPC reads.`, {
    cause: lastError,
  });
}

const eventuallyRead = <T>(
  label: string,
  functionName: string,
  args: readonly unknown[],
  accepts: (value: T) => boolean,
) => eventually(label, () => read<T>(functionName, args), accepts);

async function wait(hash: `0x${string}`, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: Math.max(manifest.requiredConfirmations, 2),
    timeout: 120_000,
  });
  assert.equal(receipt.status, "success", `${label} transaction reverted.`);
  await sleep(1_500);
  console.log(`${label}: ${hash}`);
}

async function execute(
  actor: Actor,
  label: string,
  functionName: string,
  args: readonly unknown[] = [],
  value?: bigint,
) {
  const simulation = await eventually(`Simulation for ${label}`, () => publicClient.simulateContract({
    account: actor.account,
    ...contractRequest,
    functionName,
    args,
    ...(value === undefined ? {} : { value }),
  } as never));
  const hash = await actor.wallet.writeContract(simulation.request as never);
  await wait(hash, label);
  return hash;
}

async function expectSimulationFailure(
  actor: Actor,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
) {
  let failed = false;
  try {
    await publicClient.simulateContract({
      account: actor.account,
      ...contractRequest,
      functionName,
      args,
      ...(value === undefined ? {} : { value }),
    } as never);
  } catch {
    failed = true;
  }
  assert.equal(failed, true, `${functionName} mismatch guard did not reject the simulation.`);
}

async function fund(address: Address) {
  const amount = parseUnits("0.01", projectConfig.chain.nativeCurrency.decimals);
  const hash = await ownerWallet.sendTransaction({ chain: null, to: address, value: amount });
  await wait(hash, `Fund ${address.slice(0, 8)}`);
}

async function sweep(actor: Actor) {
  try {
    const [balance, gasPrice] = await Promise.all([
      publicClient.getBalance({ address: actor.account.address }),
      publicClient.getGasPrice(),
    ]);
    const reserve = gasPrice * 21_000n * 4n;
    if (balance <= reserve) return;
    const hash = await actor.wallet.sendTransaction({
      chain: null,
      to: owner.address,
      value: balance - reserve,
      gas: 21_000n,
    });
    await wait(hash, `Sweep ${actor.account.address.slice(0, 8)}`);
  } catch {
    console.warn(`Could not sweep temporary test gas from ${actor.account.address}.`);
  }
}

async function main() {
  try {
    assert.equal(await publicClient.getChainId(), manifest.chainId);
    assert.equal(getAddress(await read<Address>("owner")), getAddress(owner.address));
    await fund(buyer.address);
    await fund(referrer.address);

    const annualPrice = await read<bigint>("annualPrice");
    assert.equal(await read<bigint>("quote", ["a", 1]), annualPrice * 100n);
    assert.equal(await read<bigint>("quote", ["aa", 1]), annualPrice * 25n);
    assert.equal(await read<bigint>("quote", ["aaa", 1]), annualPrice * 5n);
    assert.equal(await read<bigint>("quote", ["aaaa", 1]), annualPrice);

    const runId = randomBytes(4).toString("hex");
    const sellerLabel = `smoke-${runId}`;
    const buyerLabel = `refer-${runId}`;
    const guardLabel = `guard-${runId}`;
    const sellerTokenId = await read<bigint>("tokenIdFor", [sellerLabel]);
    const buyerTokenId = await read<bigint>("tokenIdFor", [buyerLabel]);
    const sellerQuote = await read<bigint>("quote", [sellerLabel, 1]);
    const buyerQuote = await read<bigint>("quote", [buyerLabel, 1]);
    const guardQuote = await read<bigint>("quote", [guardLabel, 1]);
    const referralBps = await read<number>("referralRewardBps");
    const marketplaceFeeBps = await read<number>("marketplaceFeeBps");

    await expectSimulationFailure(
      actors.owner,
      "register",
      [guardLabel, 1, owner.address, zeroAddress, guardQuote - 1n, 0],
      guardQuote,
    );
    await execute(
      actors.owner,
      "Register seller name",
      "register",
      [sellerLabel, 1, owner.address, zeroAddress, sellerQuote, 0],
      sellerQuote,
    );
    const expirationBeforeRenewal = await eventuallyRead<bigint>(
      "Registered name expiration",
      "expiresAt",
      [sellerTokenId],
      (expiration) => expiration > 0n,
    );
    await execute(actors.owner, "Renew seller name", "renew", [sellerTokenId, 1, sellerQuote], sellerQuote);
    await eventuallyRead<bigint>(
      "Renewed name expiration",
      "expiresAt",
      [sellerTokenId],
      (expiration) => expiration > expirationBeforeRenewal,
    );

    const profile = {
      displayName: "SEPBASE Smoke",
      bio: "Base Sepolia release verification.",
      avatar: "",
      website: "",
      twitter: "",
      github: "",
    };
    await execute(actors.owner, "Update profile", "updateNameData", [sellerTokenId, owner.address, profile]);
    await execute(actors.owner, "Set primary", "setPrimaryName", [sellerTokenId]);
    await eventuallyRead<string>(
      "Primary name",
      "primaryNameOf",
      [owner.address],
      (name) => name === `${sellerLabel}.${manifest.suffix}`,
    );

    await expectSimulationFailure(
      actors.buyer,
      "register",
      [buyerLabel, 1, buyer.address, referrer.address, buyerQuote, referralBps + 1],
      buyerQuote,
    );
    await execute(
      actors.buyer,
      "Register referred name",
      "register",
      [buyerLabel, 1, buyer.address, referrer.address, buyerQuote, referralBps],
      buyerQuote,
    );
    const expectedReward = (buyerQuote * BigInt(referralBps)) / 10_000n;
    await eventuallyRead<bigint>(
      "Referral reward",
      "referralBalance",
      [referrer.address],
      (balance) => balance === expectedReward,
    );

    const cancelPrice = parseUnits("0.0001", manifest.settlement.decimals);
    await expectSimulationFailure(
      actors.buyer,
      "listForSale",
      [buyerTokenId, cancelPrice, marketplaceFeeBps + 1],
    );
    await execute(
      actors.buyer,
      "Create cancellable listing",
      "listForSale",
      [buyerTokenId, cancelPrice, marketplaceFeeBps],
    );
    await execute(actors.buyer, "Cancel listing", "cancelListing", [buyerTokenId]);

    const salePrice = parseUnits("0.0002", manifest.settlement.decimals);
    await execute(
      actors.owner,
      "List seller name",
      "listForSale",
      [sellerTokenId, salePrice, marketplaceFeeBps],
    );
    await expectSimulationFailure(
      actors.buyer,
      "buyListedName",
      [sellerTokenId, salePrice + 1n],
      salePrice,
    );
    await execute(
      actors.buyer,
      "Buy listed name",
      "buyListedName",
      [sellerTokenId, salePrice],
      salePrice,
    );

    await eventually(
      "Marketplace ownership and reset state",
      async () => {
        const [tokenOwner, resolvedAddress, formerPrimary, clearedProfile, sellerBalance] = await Promise.all([
          read<Address>("ownerOf", [sellerTokenId]),
          read<Address>("resolvedAddress", [sellerTokenId]),
          read<string>("primaryNameOf", [owner.address]),
          read<{ displayName: string }>("profileOf", [sellerTokenId]),
          read<bigint>("sellerBalance", [owner.address]),
        ]);
        return { tokenOwner, resolvedAddress, formerPrimary, clearedProfile, sellerBalance };
      },
      (state) => getAddress(state.tokenOwner) === getAddress(buyer.address)
        && getAddress(state.resolvedAddress) === getAddress(buyer.address)
        && state.formerPrimary === ""
        && state.clearedProfile.displayName === ""
        && state.sellerBalance === salePrice,
    );

    await execute(actors.referrer, "Claim referral reward", "claimReferralRewards", [referrer.address]);
    await execute(actors.owner, "Claim sale proceeds", "claimSaleProceeds", [owner.address]);
    assert.equal(await read<bigint>("referralBalance", [referrer.address]), 0n);
    assert.equal(await read<bigint>("sellerBalance", [owner.address]), 0n);
    assert.equal(await read<boolean>("isSolvent"), true);

    await execute(actors.owner, "Withdraw treasury surplus", "withdrawTreasury");
    await eventuallyRead<bigint>(
      "Treasury withdrawal",
      "treasuryAvailableBalance",
      [],
      (balance) => balance === 0n,
    );

    console.log(`Base Sepolia smoke passed for ${sellerLabel}.${manifest.suffix} and ${buyerLabel}.${manifest.suffix}.`);
  } finally {
    await Promise.allSettled([sweep(actors.buyer), sweep(actors.referrer)]);
  }
}

await main();
