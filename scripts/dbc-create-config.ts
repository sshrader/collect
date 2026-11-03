/**
 * One-time setup: creates the Collect bonding-curve config on Meteora.
 * Every coin launched in the app is a pool made from this config, so these numbers set your fees and curve shape.
 *
 *   npm run dbc-config            build it and send it (uses .devnet-keypair.json as the partner wallet)
 *   npm run dbc-config -- --check build and print the settings without sending anything
 *
 * Settings come from .env (all optional). Market caps are in SOL, not dollars.
 *   DBC_INITIAL_MC=30     market cap when a coin starts
 *   DBC_MIGRATION_MC=300  market cap at which the curve is full and the coin moves to a DEX
 *   DBC_FEE_BPS=100       trading fee in basis points (100 = 1%). Meteora's minimum is 25.
 *   DBC_FEE_CLAIMER=<address>  wallet that can claim your fees (use a hardware wallet or multisig on mainnet). Default: the key-file wallet
 *   DBC_CREATOR_FEE_PCT=0 share of your fees (after Meteora's 20% cut) that goes to the coin's creator, 0-100
 */
import 'dotenv/config';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { connect, feeClaimerFor, loadPartner, requireMainnetConfirm } from './common';
import { NATIVE_MINT } from '@solana/spl-token';
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const checkOnly = process.argv.includes('--check');
const num = (name: string, fallback: number) => (process.env[name] ? Number(process.env[name]) : fallback);

const initialMC = num('DBC_INITIAL_MC', 30);
const migrationMC = num('DBC_MIGRATION_MC', 300);
const feeBps = num('DBC_FEE_BPS', 100);
const creatorFeePct = num('DBC_CREATOR_FEE_PCT', 0);

if (!(initialMC > 0) || !(migrationMC > initialMC)) throw new Error('DBC_MIGRATION_MC must be larger than DBC_INITIAL_MC.');
if (feeBps < 25) throw new Error('DBC_FEE_BPS must be at least 25 (Meteora minimum).');

const curve = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPLToken,
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: TokenDecimal.NINE, // SOL
    tokenAuthorityOption: TokenAuthorityOption.Immutable,
    totalTokenSupply: 1_000_000_000,
    leftover: 0,
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: { startingFeeBps: feeBps, endingFeeBps: feeBps, numberOfPeriod: 0, totalDuration: 0 },
    },
    dynamicFeeEnabled: true,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: creatorFeePct,
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: true,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationFeeOption: MigrationFeeOption.Customizable,
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    migratedPoolFee: {
      collectFeeMode: MigratedCollectFeeMode.QuoteToken,
      dynamicFee: DammV2DynamicFeeMode.Enabled,
      poolFeeBps: 100,
    },
  },
  // All graduated liquidity is locked for good, so nobody (including you) can pull it from the DEX pool.
  liquidityDistribution: {
    partnerLiquidityPercentage: 0,
    partnerPermanentLockedLiquidityPercentage: 100,
    creatorLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 0,
  },
  lockedVesting: {
    totalLockedVestingAmount: 0,
    numberOfVestingPeriod: 0,
    cliffUnlockAmount: 0,
    totalVestingDuration: 0,
    cliffDurationFromMigrationTime: 0,
  },
  activationType: ActivationType.Timestamp,
  initialMarketCap: initialMC,
  migrationMarketCap: migrationMC,
});

console.log('\nCurve settings');
console.log(`  starts at      ${initialMC} SOL market cap`);
console.log(`  graduates at   ${migrationMC} SOL market cap`);
console.log(`  trading fee    ${(feeBps / 100).toFixed(2)}% (Meteora keeps 20% of it, ${creatorFeePct}% of the rest goes to creators)`);
// How much SOL buyers must put in before the curve is full and the coin graduates.
const fillLamports = (curve as { migrationQuoteThreshold?: { toString(): string } }).migrationQuoteThreshold;
if (fillLamports) console.log(`  to fill it     about ${(Number(fillLamports.toString()) / LAMPORTS_PER_SOL).toFixed(2)} SOL of buys (plus fees)`);
console.log('  supply         1,000,000,000 (6 decimals), plain SPL token, metadata locked');
console.log('  after graduating: liquidity moves to a DAMM v2 pool and is locked permanently');

if (checkOnly) {
  console.log('\n--check: nothing was sent.');
  process.exit(0);
}

const partner = loadPartner();
const { connection, mainnet } = await connect();
if (mainnet) {
  console.log('\nMAINNET: these numbers are permanent. Fees, curve and graduation size cannot be edited after this.');
}

const balance = await connection.getBalance(partner.publicKey);
console.log(`\nPartner wallet ${partner.publicKey.toBase58()}  (${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL)`);
if (balance < 0.05 * LAMPORTS_PER_SOL) throw new Error('Fund this wallet with at least 0.05 SOL first (devnet: faucet.solana.com).');

const claimer = feeClaimerFor(partner);
console.log(`Deployer wallet (pays for this, no special rights): ${partner.publicKey.toBase58()}`);
console.log(`Fee claimer (the ONLY wallet that can ever claim fees, set forever): ${claimer.toBase58()}`);
if (mainnet && claimer.equals(partner.publicKey)) {
  console.log('\nWARNING: the fee claimer is the same key-file wallet that sits on this machine. Set DBC_FEE_CLAIMER to a hardware wallet or multisig address unless you accept that risk.');
}
requireMainnetConfirm(mainnet, 'Creating the config'); // after the claimer is shown, so you see who gets the fees first
const config = Keypair.generate();
const client = new DynamicBondingCurveClient(connection, 'confirmed');
const tx = await client.partner.createConfig({
  config: config.publicKey,
  feeClaimer: claimer,
  leftoverReceiver: claimer,
  payer: partner.publicKey,
  quoteMint: NATIVE_MINT,
  ...curve,
});
const latest = await connection.getLatestBlockhash('confirmed');
tx.feePayer = partner.publicKey;
tx.recentBlockhash = latest.blockhash;
tx.sign(partner, config);
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');

console.log(`\nConfig created. Transaction: ${sig}`);
console.log('\nAdd these two lines to .env, then restart `npm run dev`:\n');
console.log(`DBC_CONFIG=${config.publicKey.toBase58()}`);
console.log(`VITE_DBC_CONFIG=${config.publicKey.toBase58()}`);
console.log(`\nFees can only be claimed by ${claimer.toBase58()}. If that is a wallet you control in Phantom/Ledger, open https://<your site>/#/admin with it connected to claim.`);
