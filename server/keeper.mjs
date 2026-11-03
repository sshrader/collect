// The keeper: every minute, looks at who holds each coin and gives each qualifying holder one unique collectible.
//
// The rules (all in this file, so they are easy to change):
//  - A coin's collectibles open once all 40 pictures are drawn.
//  - A wallet qualifies by holding at least the coin's minimum (set by the creator, as a % of supply).
//  - It must have held that much on every check for `holdMs` (so a buy-and-instant-sell does not count).
//  - One collectible per wallet. Earliest qualifier first. Which character you get is picked at random.
//  - The collectible is a real NFT sent to the holder's wallet. After that it is theirs: selling the coin does not
//    take it back, and the NFT can be traded like any other. Only 40 exist, so each image has exactly one owner.
//  - Only normal wallets qualify (not the curve's own vault, DEX pools or other program-owned accounts).
import crypto from 'node:crypto';
import * as store from './store.mjs';

const MAX_MINT_TRIES = 6;
const seen = new Map(); // "mint:wallet" -> { first, last }  (when we first saw it qualifying, and on which check)
let checkNo = 0;

export const resetMemory = () => { seen.clear(); checkNo = 0; };

/**
 * One pass over every open coin. `chain` is injected: { holders(mint) -> [{wallet, amount: bigint}],
 * mint(token, slot, wallet) -> signature, minted(token, slot) -> bool }.
 */
export async function tick({ chain, now = Date.now(), holdMs = 90_000, exclude = new Set(), pick = (n) => crypto.randomInt(n) } = {}) {
  checkNo++;
  const result = { assigned: 0, minted: 0 };
  for (const t of store.all()) {
    if (t.status !== 'live' || !t.collection || t.collection.state !== 'open') continue;
    const c = t.collection;

    // 1. Finish mints that were interrupted or failed. The NFT address is fixed per slot, so retrying can never mint twice.
    for (const s of c.slots.filter((x) => x.mintStatus === 'minting')) {
      try {
        if (!(await chain.minted(t, s))) await chain.mint(t, s, s.owner);
        store.update(t.id, (x) => { x.collection.slots.find((y) => y.n === s.n).mintStatus = 'done'; });
        result.minted++;
      } catch (e) {
        console.error(`mint ${t.symbol} #${s.n} failed:`, e.message);
        store.update(t.id, (x) => {
          const y = x.collection.slots.find((z) => z.n === s.n);
          y.mintTries = (y.mintTries || 0) + 1;
          if (y.mintTries >= MAX_MINT_TRIES) { y.owner = null; y.mintStatus = null; y.mintTries = 0; } // give the slot back
        });
      }
    }

    // 2. Hand out the free ones.
    let free = c.slots.filter((s) => !s.owner);
    if (!free.length) continue;
    const holders = await chain.holders(t.mint);
    const min = BigInt(c.minRaw);
    const owners = new Set(c.slots.filter((s) => s.owner).map((s) => s.owner));
    const live = new Set();
    for (const h of holders) {
      if (h.amount < min || owners.has(h.wallet) || exclude.has(h.wallet)) continue;
      const key = `${t.mint}:${h.wallet}`;
      live.add(key);
      const prev = seen.get(key);
      // Must have qualified on the previous check too, otherwise the clock restarts.
      seen.set(key, prev && prev.last === checkNo - 1 ? { first: prev.first, last: checkNo } : { first: now, last: checkNo });
    }
    for (const key of [...seen.keys()]) if (key.startsWith(t.mint + ':') && !live.has(key)) seen.delete(key);

    const ready = [...live]
      .map((k) => ({ wallet: k.slice(t.mint.length + 1), ...seen.get(k) }))
      .filter((h) => now - h.first >= holdMs)
      .sort((a, b) => a.first - b.first);
    for (const h of ready) {
      if (!free.length) break;
      const slot = free.splice(pick(free.length), 1)[0];
      store.update(t.id, (x) => {
        const y = x.collection.slots.find((z) => z.n === slot.n);
        y.owner = h.wallet; // written first, so a crash can never hand the same slot to two people
        y.mintStatus = 'minting';
        y.assignedAt = now;
      });
      result.assigned++;
    }
  }
  return result;
}

let running = false;
export function start(chain, everyMs = 60_000, opts = {}) {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await tick({ chain, ...opts });
      // Mint right away rather than waiting for the next pass.
      if (r.assigned) await tick({ chain, ...opts });
    } catch (e) {
      console.error('keeper error:', e);
    } finally {
      running = false;
    }
  };
  setInterval(run, everyMs).unref();
  return run;
}
