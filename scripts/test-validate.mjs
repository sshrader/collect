// Checks for the launch form validation, image sniffing and the token store. Plain Node, no packages needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-test-'));
const { validateLaunch, decodeImage, looksLikeAddress } = await import('../server/validate.mjs');
const store = await import('../server/store.mjs');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

const WALLET = '22A8vB2FhL74QwbVEL6R5KZGcH3WGMqXiCd7fFdj1PTR';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const png = 'data:image/png;base64,' + PNG.toString('base64');
const good = { wallet: WALLET, name: 'Pay Dirt', symbol: '$dirt', description: 'Gold in the cart', website: 'https://paydirtmines.xyz', twitter: '', telegram: '', image: png };

test('addresses: real ones pass, junk fails', () => {
  assert.ok(looksLikeAddress(WALLET));
  assert.ok(!looksLikeAddress('hello'));
  assert.ok(!looksLikeAddress('0OIl' + 'a'.repeat(30))); // 0 O I l are not base58
  assert.ok(!looksLikeAddress(undefined));
});

test('a good form is cleaned: ticker upper-cased, $ dropped', () => {
  const r = validateLaunch(good);
  assert.ok(r.ok);
  assert.equal(r.value.symbol, 'DIRT');
  assert.equal(r.value.links.website, 'https://paydirtmines.xyz/');
});

test('bad names, tickers and links are refused with a message', () => {
  const bad = (patch) => validateLaunch({ ...good, ...patch });
  assert.ok(!bad({ name: '' }).ok);
  assert.ok(!bad({ name: 'x'.repeat(33) }).ok);
  assert.ok(!bad({ name: 'bad\u0000name' }).ok);
  assert.ok(!bad({ symbol: 'A' }).ok);
  assert.ok(!bad({ symbol: 'TOOLONGTICKER' }).ok);
  assert.ok(!bad({ symbol: 'A-B' }).ok);
  assert.ok(!bad({ website: 'http://insecure.example' }).ok);
  assert.ok(!bad({ website: 'javascript:alert(1)' }).ok);
  assert.ok(!bad({ twitter: 'not a url' }).ok);
  assert.ok(!bad({ description: 'x'.repeat(501) }).ok);
  assert.ok(!bad({ wallet: 'nope' }).ok);
  assert.ok(!bad({ image: '' }).ok);
  assert.match(bad({ symbol: 'A' }).error, /Ticker/);
});

test('images: png ok; svg, wrong type, spoofed type and oversize refused', () => {
  const ok = decodeImage(png, 1000);
  assert.ok(ok.ok); assert.equal(ok.ext, 'png');
  assert.ok(!decodeImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 1000).ok);
  assert.ok(!decodeImage('data:image/jpeg;base64,' + PNG.toString('base64'), 1000).ok); // says jpeg, is png
  assert.ok(!decodeImage(png, 10).ok);
  assert.ok(!decodeImage('data:image/png;base64,', 1000).ok);
});

test('store: pending launches count toward the hourly limit, expire, and only live ones are listed', () => {
  const id = store.newId();
  store.addPending({ id, mint: 'MINT1', creator: WALLET, name: 'A', symbol: 'AA', description: '', links: {}, imageExt: 'png' }, PNG);
  assert.equal(store.countRecent(WALLET, 3600_000), 1);
  assert.equal(store.list().length, 0);
  assert.ok(fs.existsSync(store.imagePath(store.get(id))));
  store.markLive(id, 'sig');
  assert.equal(store.list().length, 1);
  assert.equal(store.get('MINT1').id, id);
  const id2 = store.newId();
  store.addPending({ id: id2, mint: 'MINT2', creator: WALLET, name: 'B', symbol: 'BB', description: '', links: {}, imageExt: 'png' }, PNG);
  const file = store.imagePath(store.get(id2));
  store.expirePending(1000, Date.now() + 5000);
  assert.equal(store.get(id2), null, 'unsigned launch dropped');
  assert.ok(!fs.existsSync(file), 'and its image file');
  assert.ok(store.get(id), 'live ones stay');
  assert.equal(store.publicView(store.get(id)).image, '/img/' + id);
});

fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
