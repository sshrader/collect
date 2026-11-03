// Builds the launch transaction for the visitor's wallet and checks on-chain that it happened.
// The visitor pays and signs; the server only adds the new token's own key (the mint), which it never stores.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, clusterApiUrl } from '@solana/web3.js';
import BN from 'bn.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import * as store from './store.mjs';
import { decodeImage, validateLaunch } from './validate.mjs';
import { buildRoster, validateCollection } from './roster.mjs';

const CONFIG = (process.env.DBC_CONFIG || '').trim();
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8787').replace(/\/+$/, '');
const MAX_PER_HOUR = Number(process.env.MAX_LAUNCHES_PER_HOUR || 3);
const MAX_IMAGE = Number(process.env.MAX_IMAGE_BYTES || 1_000_000);
const PENDING_MS = 15 * 60 * 1000;
const MAX_DEV_BUY = Number(process.env.MAX_DEV_BUY_SOL || 5); // SOL a creator may spend on their own coin at launch
const FEE_LAMPORTS = Math.round(Number(process.env.LAUNCH_FEE_SOL || 0) * LAMPORTS_PER_SOL); // covers drawing the 40 pictures
const FEE_WALLET = (process.env.LAUNCH_FEE_WALLET || '').trim();
const SUPPLY_RAW = 1_000_000_000n * 10n ** 6n; // matches scripts/dbc-create-config.ts: 1B tokens, 6 decimals
const TX_LIMIT = 1232; // the most bytes a Solana transaction can be

const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

export const launchReady = () => !!CONFIG;
export const cluster = () => process.env.SOLANA_CLUSTER || 'devnet'; // only shown to visitors; the real network is whatever SOLANA_RPC_URL points at

export class UserError extends Error {}

/** Step 1: check the form, save the image + details, and return a transaction (base64) for the wallet to sign. */
export async function prepare(body) {
  if (!CONFIG) throw new UserError('The launchpad is not set up yet (DBC_CONFIG is empty).');
  store.expirePending(PENDING_MS);
  const v = validateLaunch(body);
  if (!v.ok) throw new UserError(v.error);
  const f = v.value;
  let creator;
  try {
    creator = new PublicKey(f.wallet);
  } catch {
    throw new UserError('That wallet address is not valid.');
  }
  if (store.countRecent(f.wallet, 60 * 60 * 1000) >= MAX_PER_HOUR) throw new UserError(`Limit: ${MAX_PER_HOUR} launches per hour per wallet. Try again later.`);
  const img = decodeImage(f.image, MAX_IMAGE);
  if (!img.ok) throw new UserError(img.error);
  if (f.devBuy > MAX_DEV_BUY) throw new UserError(`The dev buy can be at most ${MAX_DEV_BUY} SOL.`);
  const col = validateCollection(f.collection);
  if (!col.ok) throw new UserError(col.error);
  if (FEE_LAMPORTS > 0 && !FEE_WALLET) throw new Error('LAUNCH_FEE_SOL is set but LAUNCH_FEE_WALLET is empty.');

  const mint = Keypair.generate();
  const id = store.newId();
  const uri = `${PUBLIC_URL}/meta/${id}.json`;
  const createPoolParam = { baseMint: mint.publicKey, config: new PublicKey(CONFIG), name: f.name, symbol: f.symbol, uri, payer: creator, poolCreator: creator };
  // With a dev buy, the pool is created and the creator's first buy happens in the SAME transaction, so nobody can get in before them.
  const tx = f.devBuy > 0
    ? await client.creator.createPoolWithFirstBuy({
        createPoolParam,
        firstBuyParam: { buyer: creator, receiver: creator, buyAmount: new BN(Math.round(f.devBuy * LAMPORTS_PER_SOL)), minimumAmountOut: new BN(0), referralTokenAccount: null },
      })
    : await client.creator.createPool(createPoolParam);
  if (FEE_LAMPORTS > 0) tx.add(SystemProgram.transfer({ fromPubkey: creator, toPubkey: new PublicKey(FEE_WALLET), lamports: FEE_LAMPORTS }));
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = creator;
  tx.recentBlockhash = latest.blockhash;
  tx.partialSign(mint); // the new token's own key; the wallet adds the creator's signature
  const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  if (raw.length > TX_LIMIT) throw new UserError('This launch is too big for one transaction. Try without the dev buy.');

  const minTokens = (Number(SUPPLY_RAW / 10n ** 6n) * f.minPct) / 100;
  const minRaw = ((SUPPLY_RAW * BigInt(Math.round(f.minPct * 100))) / 10000n).toString();
  const collection = {
    spec: col.value,
    slots: buildRoster(col.value, f.name, id),
    state: 'generating', // flips to 'open' when all 40 pictures exist
    minPct: f.minPct,
    minTokens,
    minRaw,
  };
  store.addPending({ id, mint: mint.publicKey.toBase58(), creator: f.wallet, name: f.name, symbol: f.symbol, description: f.description, links: f.links, imageExt: img.ext, devBuy: f.devBuy, collection }, img.bytes);
  return { id, mint: mint.publicKey.toBase58(), transaction: Buffer.from(raw).toString('base64') };
}

/** Step 2: the wallet sent the transaction; confirm it really landed and was this launch, then publish it. */
export async function confirm({ id, signature }) {
  const t = store.get(String(id || ''));
  if (!t) throw new UserError('Unknown launch (it may have expired). Start again.');
  if (t.status === 'live') return t;
  if (typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature)) throw new UserError('Missing transaction signature.');
  const res = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!res) throw new UserError('The transaction is not confirmed yet. Wait a moment and try again.');
  if (res.meta?.err) throw new UserError('The transaction failed on-chain, so nothing was launched.');
  const keys = res.transaction.message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  // The new token's key is a required signer and the server signed it over the exact transaction it built,
  // so the wallet can only have sent our version of it (dev buy and fee included).
  const signers = res.transaction.message.header.numRequiredSignatures;
  if (keys[0] !== t.creator || keys.indexOf(t.mint) < 0 || keys.indexOf(t.mint) >= signers) throw new UserError('That transaction is not this launch.');
  return store.markLive(t.id, signature);
}

/** The JSON wallets and explorers read from the token's metadata link. */
export function metadataFor(t) {
  const meta = { name: t.name, symbol: t.symbol, description: t.description, image: `${PUBLIC_URL}/img/${t.id}` };
  if (t.links?.website) meta.external_url = t.links.website;
  const ext = {};
  if (t.links?.website) ext.website = t.links.website;
  if (t.links?.twitter) ext.twitter = t.links.twitter;
  if (t.links?.telegram) ext.telegram = t.links.telegram;
  if (Object.keys(ext).length) meta.extensions = ext;
  return meta;
}

/** The JSON wallets read for one collectible. */
export function nftMetadataFor(t, slot) {
  return {
    name: slot.name,
    symbol: t.symbol,
    description: `${slot.name}: one of ${t.collection.slots.length} unique ${t.collection.spec.theme} collectibles for $${t.symbol}. Only one wallet owns each.`,
    image: `${PUBLIC_URL}/nft/${t.id}/${slot.n}.${slot.ext}`,
    external_url: `${PUBLIC_URL}/#/token/${t.id}`,
    attributes: slot.attributes.map((a) => ({ trait_type: a.label, value: a.value })),
    properties: { files: [{ uri: `${PUBLIC_URL}/nft/${t.id}/${slot.n}.${slot.ext}`, type: { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' }[slot.ext] }], category: 'image' },
  };
}
