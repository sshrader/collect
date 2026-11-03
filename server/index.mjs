// Collect server: the API, the token metadata and images, and the built website.
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import * as store from './store.mjs';
import { MIME } from './validate.mjs';
import { UserError, cluster, confirm, launchReady, metadataFor, prepare } from './launch.mjs';

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
app.get('/api/config', (_req, res) => res.json({ ready: launchReady(), cluster: cluster() }));
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

// What each token's on-chain metadata link points at. These must keep working for as long as the token exists.
app.get('/meta/:id.json', (req, res) => {
  const t = store.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.setHeader('cache-control', 'public, max-age=300');
  res.json(metadataFor(t));
});
app.get('/img/:id', (req, res) => {
  const t = store.get(req.params.id);
  if (!t || !fs.existsSync(store.imagePath(t))) return res.status(404).end();
  res.setHeader('content-type', MIME[t.imageExt]);
  res.setHeader('cache-control', 'public, max-age=86400');
  fs.createReadStream(store.imagePath(t)).pipe(res);
});

const DIST = path.resolve('dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}
app.listen(PORT, () => console.log(`Collect on http://localhost:${PORT}  (${launchReady() ? 'config set' : 'DBC_CONFIG missing: launches are disabled'})`));
