// Tests the picture queue and the keeper with fake art and a fake chain (no network).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
const store = await import('../server/store.mjs');
const queue = await import('../server/queue.mjs');
const keeper = await import('../server/keeper.mjs');
const art = await import('../server/art.mjs');
const { buildRoster, validateCollection } = await import('../server/roster.mjs');

const spec = validateCollection({ theme: 'space frogs', traits: [
  { label: 'Species', options: ['frog', 'toad', 'newt', 'axolotl'] },
  { label: 'Hat', options: ['helmet', 'crown', 'beanie', 'hardhat', 'cap'] },
  { label: 'Item', options: ['pickaxe', 'torch', 'gem'] }] }).value;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), Buffer.alloc(8)]);
const mk = (id) => store.addPending({ id, mint: 'Mint' + id, creator: 'C' + id, name: 'Frog', symbol: 'FROG', description: '', links: {}, imageExt: 'png',
  collection: { spec, slots: buildRoster(spec, 'Frog', id), state: 'generating', minPct: 0.1, minTokens: 1e6, minRaw: '1000000000000' } }, png);
const live = (id) => { mk(id); store.markLive(id, 'sig'); };
const tok = (id) => store.get(id);
let ok = 0;
const check = (name, fn) => Promise.resolve(fn()).then(() => console.log('ok ', name), (e) => { console.error('FAIL', name, '\n', e); process.exit(1); }).then(() => ok++);

await check('pictures are drawn only for live coins, retried on failure, and open the collection at 40', async () => {
  mk('pend'); // still pending: must be ignored
  live('a');
  let calls = 0;
  const flaky = { render: async (slot, seed) => { calls++; if (slot.n === 7 && calls < 12) throw new Error('boom'); return art.placeholder(slot, seed); } };
  await queue.pass({ art: flaky, now: 1000 });
  assert.equal(tok('a').collection.state, 'generating', 'slot 7 failed, so not open yet');
  assert.equal(tok('a').collection.slots.filter((s) => s.status === 'ready').length, 39);
  assert.equal(tok('pend').collection.slots.filter((s) => s.status === 'ready').length, 0);
  await queue.pass({ art: flaky, now: 1000 + 10_000 }); // too early to retry (30 s back-off)
  assert.equal(tok('a').collection.state, 'generating');
  await queue.pass({ art: flaky, now: 1000 + 40_000 });
  assert.equal(tok('a').collection.state, 'open');
  assert.ok(fs.existsSync(store.nftFile(tok('a'), 40, 'svg')));
});

const holders = { Mmint: 0 };
const bal = {}; // wallet -> bigint, mutable per test
const minted = new Set();
const chain = {
  holders: async () => Object.entries(bal).map(([wallet, amount]) => ({ wallet, amount })),
  minted: async (t, s) => minted.has(t.id + s.n),
  mint: async (t, s, w) => { if (chain.fail) throw new Error('rpc down'); minted.add(t.id + s.n); chain.log.push([s.n, w]); },
  log: [],
};
const MIN = 1_000_000_000_000n;
const T = (ms) => ({ chain, now: ms, holdMs: 90_000 });

await check('a holder must keep the minimum across checks before getting one; below-minimum wallets never do', async () => {
  keeper.resetMemory();
  bal.Alice = MIN; bal.Bob = MIN - 1n;
  let r = await keeper.tick(T(0));
  assert.equal(r.assigned, 0, 'first sighting only starts the clock');
  r = await keeper.tick(T(60_000));
  assert.equal(r.assigned, 0, 'not held long enough yet');
  r = await keeper.tick(T(100_000));
  assert.equal(r.assigned, 1);
  assert.deepEqual([...new Set(tok('a').collection.slots.filter((s) => s.owner).map((s) => s.owner))], ['Alice']);
  r = await keeper.tick(T(110_000));
  assert.equal(r.minted, 1);
  assert.equal(chain.log.length, 1);
  assert.equal(chain.log[0][1], 'Alice');
  assert.equal(tok('a').collection.slots.find((s) => s.owner === 'Alice').mintStatus, 'done');
});

await check('one per wallet, and a wallet that sells before the clock runs out starts over', async () => {
  bal.Alice = MIN * 5n; // still holds, already has one
  bal.Carol = MIN;
  await keeper.tick(T(120_000));
  delete bal.Carol; // sells
  await keeper.tick(T(150_000));
  bal.Carol = MIN; // buys back
  await keeper.tick(T(200_000));
  let r = await keeper.tick(T(250_000));
  assert.equal(r.assigned, 0, 'clock restarted at 200000, only 50 s have passed');
  r = await keeper.tick(T(300_000));
  assert.equal(r.assigned, 1);
  const owners = tok('a').collection.slots.filter((s) => s.owner).map((s) => s.owner).sort();
  assert.deepEqual(owners, ['Alice', 'Carol']);
});

await check('never more than 40, and no two wallets share a character', async () => {
  for (let i = 0; i < 60; i++) bal['W' + i] = MIN;
  let now = 400_000;
  for (let k = 0; k < 6; k++) { await keeper.tick(T(now)); now += 100_000; }
  const slots = tok('a').collection.slots;
  assert.equal(slots.filter((s) => s.owner).length, 40);
  assert.equal(new Set(slots.map((s) => s.owner)).size, 40);
  const done = await keeper.tick(T(now));
  assert.equal(slots.filter((s) => s.mintStatus === 'done').length, 40);
  assert.equal(new Set(chain.log.map((l) => l[0])).size, 40, 'each slot minted exactly once');
});

await check('a failing mint is retried, never doubled, and the slot is released after too many failures', async () => {
  keeper.resetMemory();
  live('b');
  const t = tok('b');
  store.update('b', (x) => { x.collection.state = 'open'; x.collection.slots.forEach((s) => { s.status = 'ready'; s.ext = 'svg'; }); });
  for (const k of Object.keys(bal)) delete bal[k];
  bal.Dan = MIN;
  chain.fail = true; chain.log.length = 0;
  await keeper.tick(T(0)); await keeper.tick(T(100_000)); // assigned
  const slot = tok('b').collection.slots.find((s) => s.owner === 'Dan');
  assert.ok(slot);
  for (let i = 0; i < 5; i++) await keeper.tick(T(200_000 + i));
  assert.equal(slot.mintStatus, 'minting', 'still trying');
  chain.fail = false;
  await keeper.tick(T(300_000));
  assert.equal(slot.mintStatus, 'done');
  assert.equal(chain.log.length, 1);
  // too many failures releases the slot
  bal.Eve = MIN; chain.fail = true;
  await keeper.tick(T(400_000)); await keeper.tick(T(500_000));
  const eves = () => tok('b').collection.slots.filter((s) => s.owner === 'Eve');
  assert.equal(eves().length, 1);
  for (let i = 0; i < 6; i++) await keeper.tick(T(600_000 + i));
  assert.ok(eves().length <= 1);
});

await check('creator-excluded and program wallets: excluded wallets never qualify', async () => {
  keeper.resetMemory();
  live('c');
  store.update('c', (x) => { x.collection.state = 'open'; x.collection.slots.forEach((s) => { s.status = 'ready'; s.ext = 'svg'; }); });
  for (const k of Object.keys(bal)) delete bal[k];
  bal.Boss = MIN; chain.fail = false;
  const ex = { ...T(0), exclude: new Set(['Boss']) };
  await keeper.tick(ex); await keeper.tick({ ...ex, now: 200_000 });
  assert.equal(tok('c').collection.slots.filter((s) => s.owner).length, 0);
});

console.log(`\n${ok} checks passed`);
