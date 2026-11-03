// Collect server: the API, the token metadata and images, and the built website.
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import * as store from './store.mjs';
import { MIME } from './validate.mjs';
import { UserError, cluster, confirm, launchReady, metadataFor, nftMetadataFor, prepare } from './launch.mjs';
import { SLOTS, buildRoster, validateCollection } from './roster.mjs';
import * as queue from './queue.mjs';
import * as art from './art.mjs';
import * as keeper from './keeper.mjs';
import { loadAuthority, makeChain } from './chain.mjs';

const PORT = Number(process.env.PORT || 8787);
const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  next();
});

// A small per-IP limit on the two write routes (the per-wallet limit lives in launch.mjs).
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const arr = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many requests. Slow down a little.' });
    arr.push(now);
    hits.set(req.ip, arr);
    next();
  };
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

app.get('/api/health', (_req, res) => res.json({ ok: true, ready: launchReady() }));
const authority = loadAuthority();
app.get('/api/config', (_req, res) =>
  res.json({
    ready: launchReady(),
    cluster: cluster(),
    slots: SLOTS,
    maxDevBuy: Number(process.env.MAX_DEV_BUY_SOL || 5),
    launchFee: Number(process.env.LAUNCH_FEE_SOL || 0),
    realArt: art.usingAi(), // false = test placeholder pictures
    minting: !!authority, // false = collectibles are assigned but not minted until AUTHORITY_KEYPAIR is set
  }),
);

app.get('/api/tokens', (req, res) => res.json({ tokens: store.list({ q: String(req.query.q || ''), limit: Math.min(100, Number(req.query.limit) || 60) }).map(store.publicView) }));
app.get('/api/tokens/:key', (req, res) => {
  const t = store.get(req.params.key);
  if (!t || t.status !== 'live') return res.status(404).json({ error: 'Token not found.' });
  res.json(store.publicView(t));
});

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
  }
};
app.post('/api/launch/prepare', limit(20, 60 * 60 * 1000), express.json({ limit: '2mb' }), wrap((req) => prepare(req.body)));
app.post('/api/launch/confirm', limit(60, 60 * 60 * 1000), express.json({ limit: '10kb' }), wrap(async (req) => store.publicView(await confirm(req.body || {}))));

// Shows the creator the 40 characters their description will make, before they launch. Free: no pictures are drawn yet.
app.post('/api/collection/preview', limit(60, 60 * 60 * 1000), express.json({ limit: '20kb' }), wrap((req) => {
  const c = validateCollection(req.body?.collection);
  if (!c.ok) throw new UserError(c.error);
  return { slots: buildRoster(c.value, String(req.body?.name || 'Name').slice(0, 32), 'preview').map(({ n, name, attributes }) => ({ n, name, attributes })) };
}));
// What each token's on-chain metadata link points at. These must keep working for as long as the token exists.
app.get('/meta/:id.json', (req, res) => {
  const t = store.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.setHeader('cache-control', 'public, max-age=300');
  res.json(metadataFor(t));
});
// One collectible's NFT metadata and picture, plus the collection's own metadata. They must keep working for good too.
app.get('/nft/:id/:file', (req, res) => {
  const t = store.get(req.params.id);
  if (!t?.collection) return res.status(404).end();
  const m = /^(collection|\d{1,2})\.(json|png|svg)$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  if (m[1] === 'collection') {
    if (m[2] !== 'json') return res.status(404).end();
    return res.json({ name: `${t.name} Collectibles`, symbol: t.symbol, description: `${t.collection.slots.length} unique ${t.collection.spec.theme} collectibles for $${t.symbol}.`, image: `${(process.env.PUBLIC_URL || '').replace(/\/+$/, '')}/img/${t.id}` });
  }
  const slot = t.collection.slots.find((x) => x.n === Number(m[1]));
  if (!slot || slot.status !== 'ready') return res.status(404).end();
  if (m[2] === 'json') {
    res.setHeader('cache-control', 'public, max-age=300');
    return res.json(nftMetadataFor(t, slot));
  }
  if (m[2] !== slot.ext) return res.status(404).end();
  const file = store.nftFile(t, slot.n, slot.ext);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader('content-type', slot.ext === 'png' ? 'image/png' : 'image/svg+xml');
  res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'"); // an SVG opened directly can never run script
  res.setHeader('cache-control', 'public, max-age=86400');
  fs.createReadStream(file).pipe(res);
});
app.get('/img/:id', (req, res) => {
  const t = store.get(req.params.id);
  if (!t || !fs.existsSync(store.imagePath(t))) return res.status(404).end();
  res.setHeader('content-type', MIME[t.imageExt]);
  res.setHeader('cache-control', 'public, max-age=86400');
  fs.createReadStream(store.imagePath(t)).pipe(res);
});

queue.start(art);
if (authority) keeper.start(makeChain(authority), 60_000, { exclude: new Set([authority.publicKey.toBase58()]) });
else console.log('AUTHORITY_KEYPAIR not set: collectibles will not be handed out until it is set.');

const DIST = path.resolve('dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}
app.listen(PORT, () => console.log(`Collect on http://localhost:${PORT}  (${launchReady() ? 'config set' : 'DBC_CONFIG missing: launches are disabled'})`));
