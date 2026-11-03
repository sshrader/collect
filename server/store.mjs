// The token list and uploaded images, kept in DATA_DIR (a Railway volume in production).
// One JSON file, written atomically. Fine for thousands of tokens; move to a database if it grows past that.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.resolve(process.env.DATA_DIR || './data');
const IMG = path.join(DIR, 'img');
const FILE = path.join(DIR, 'tokens.json');
fs.mkdirSync(IMG, { recursive: true });

let db = { tokens: [] };
try {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!Array.isArray(db.tokens)) db = { tokens: [] };
} catch {
  /* first run */
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

export const newId = () => crypto.randomBytes(8).toString('hex');
export const imagePath = (t) => path.join(IMG, `${t.id}.${t.imageExt}`);

export function addPending(t, imageBytes) {
  fs.writeFileSync(imagePath(t), imageBytes);
  db.tokens.push({ ...t, status: 'pending', createdAt: Date.now() });
  save();
}

/** Launches this wallet started in the last `windowMs` (pending ones count, so a spammer cannot dodge the limit by never signing). */
export const countRecent = (wallet, windowMs, now = Date.now()) => db.tokens.filter((t) => t.creator === wallet && now - t.createdAt < windowMs).length;

/** Drops launches nobody signed within `maxAgeMs`, with their image files. */
export function expirePending(maxAgeMs, now = Date.now()) {
  const keep = [];
  for (const t of db.tokens) {
    if (t.status === 'pending' && now - t.createdAt > maxAgeMs) {
      fs.rmSync(imagePath(t), { force: true });
    } else keep.push(t);
  }
  if (keep.length !== db.tokens.length) {
    db.tokens = keep;
    save();
  }
}

export const get = (idOrMint) => db.tokens.find((t) => t.id === idOrMint || t.mint === idOrMint) || null;

export function markLive(id, signature) {
  const t = db.tokens.find((x) => x.id === id);
  if (!t) return null;
  t.status = 'live';
  t.signature = signature;
  t.launchedAt = Date.now();
  save();
  return t;
}

export function list({ q = '', limit = 60 } = {}) {
  const s = q.trim().toLowerCase();
  return db.tokens
    .filter((t) => t.status === 'live' && (!s || t.name.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s) || t.mint === q.trim()))
    .sort((a, b) => b.launchedAt - a.launchedAt)
    .slice(0, limit);
}

/** What the website and API show for a token (no internals). */
export const publicView = (t) => ({
  id: t.id,
  mint: t.mint,
  creator: t.creator,
  name: t.name,
  symbol: t.symbol,
  description: t.description,
  links: t.links,
  image: `/img/${t.id}`,
  status: t.status,
  signature: t.signature || null,
  launchedAt: t.launchedAt || null,
});
