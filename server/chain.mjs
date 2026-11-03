// The real Solana side of the keeper: who holds a coin, and minting the collectible NFTs (Metaplex Core).
// Not run by the tests (they use a fake with the same three functions). Needs AUTHORITY_KEYPAIR funded with a little SOL:
// each NFT costs about 0.003 SOL to create, paid by that wallet.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromKeypair, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { create, createCollection, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core';
import * as store from './store.mjs';

const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8787').replace(/\/+$/, '');
const connection = new Connection(RPC, 'confirmed');

/** AUTHORITY_KEYPAIR is either a path to a Solana key file or the JSON array itself (easier to paste into Railway). */
export function loadAuthority() {
  const v = (process.env.AUTHORITY_KEYPAIR || '').trim();
  if (!v) return null;
  const raw = v.startsWith('[') ? v : fs.readFileSync(v, 'utf8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

/**
 * The address of each NFT is derived from the authority key + coin + slot, so it is the same every time.
 * That is what makes retries safe: minting the same slot twice is impossible, the second attempt just finds it exists.
 */
function derive(authority, coinId, n) {
  const seed = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(authority.secretKey.slice(0, 32)), Buffer.from(`collect:${coinId}:${n}`)])).digest();
  return Keypair.fromSeed(seed);
}

export function makeChain(authority) {
  const umi = createUmi(RPC).use(mplCore());
  umi.use(keypairIdentity(createSignerFromKeypair(umi, fromWeb3JsKeypair(authority))));
  const signerFor = (kp) => createSignerFromKeypair(umi, fromWeb3JsKeypair(kp));

  async function ensureCollection(t) {
    const kp = derive(authority, t.id, 0);
    const address = publicKey(kp.publicKey.toBase58());
    if (!(await umi.rpc.accountExists(address))) {
      await createCollection(umi, {
        collection: signerFor(kp),
        name: `${t.name} Collectibles`.slice(0, 32),
        uri: `${PUBLIC_URL}/nft/${t.id}/collection.json`,
      }).sendAndConfirm(umi);
    }
    if (!t.collection.address) store.update(t.id, (x) => { x.collection.address = kp.publicKey.toBase58(); });
    return address;
  }

  return {
    /** Every normal wallet that holds this token, with the total it holds. Program-owned accounts (vaults, pools) are left out. */
    async holders(mint) {
      const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
        dataSlice: { offset: 32, length: 40 }, // owner (32 bytes) + amount (8 bytes)
      });
      const totals = new Map();
      for (const a of accounts) {
        const owner = new PublicKey(a.account.data.subarray(0, 32));
        const amount = a.account.data.readBigUInt64LE(32);
        if (amount === 0n || !PublicKey.isOnCurve(owner.toBytes())) continue;
        totals.set(owner.toBase58(), (totals.get(owner.toBase58()) || 0n) + amount);
      }
      return [...totals].map(([wallet, amount]) => ({ wallet, amount }));
    },

    async minted(t, slot) {
      const address = derive(authority, t.id, slot.n).publicKey.toBase58();
      const there = await umi.rpc.accountExists(publicKey(address));
      if (there && !slot.asset) store.update(t.id, (x) => { x.collection.slots.find((y) => y.n === slot.n).asset = address; });
      return there;
    },

    async mint(t, slot, wallet) {
      const collectionAddr = await ensureCollection(t);
      const asset = derive(authority, t.id, slot.n);
      const collection = await fetchCollection(umi, collectionAddr);
      const r = await create(umi, {
        asset: signerFor(asset),
        collection,
        name: slot.name.slice(0, 32),
        uri: `${PUBLIC_URL}/nft/${t.id}/${slot.n}.json`,
        owner: publicKey(wallet),
      }).sendAndConfirm(umi);
      store.update(t.id, (x) => { x.collection.slots.find((y) => y.n === slot.n).asset = asset.publicKey.toBase58(); });
      return r.signature;
    },
  };
}
