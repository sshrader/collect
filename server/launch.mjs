// Builds the launch transaction for the visitor's wallet and checks on-chain that it happened.
// The visitor pays and signs; the server only adds the new token's own key (the mint), which it never stores.
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import * as store from './store.mjs';
import { decodeImage, validateLaunch } from './validate.mjs';

const CONFIG = (process.env.DBC_CONFIG || '').trim();
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8787').replace(/\/+$/, '');
const MAX_PER_HOUR = Number(process.env.MAX_LAUNCHES_PER_HOUR || 3);
const MAX_IMAGE = Number(process.env.MAX_IMAGE_BYTES || 1_000_000);
const PENDING_MS = 15 * 60 * 1000;

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

  const mint = Keypair.generate();
  const id = store.newId();
  const uri = `${PUBLIC_URL}/meta/${id}.json`;
  const tx = await client.creator.createPool({
    baseMint: mint.publicKey,
    config: new PublicKey(CONFIG),
    name: f.name,
    symbol: f.symbol,
    uri,
    payer: creator,
    poolCreator: creator,
  });
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = creator;
  tx.recentBlockhash = latest.blockhash;
  tx.partialSign(mint); // the new token's own key; the wallet adds the creator's signature
  const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

  store.addPending({ id, mint: mint.publicKey.toBase58(), creator: f.wallet, name: f.name, symbol: f.symbol, description: f.description, links: f.links, imageExt: img.ext }, img.bytes);
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
  if (keys[0] !== t.creator || !keys.includes(t.mint)) throw new UserError('That transaction is not this launch.');
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
