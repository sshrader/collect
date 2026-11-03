// Pure input checks for a launch request. No network, no packages, so they run (and are tested) anywhere.

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CTRL = /[\u0000-\u001f\u007f]/;

/** Is this plausibly a Solana address? (The real check is `new PublicKey`, done where web3.js is loaded.) */
export const looksLikeAddress = (s) => typeof s === 'string' && B58.test(s);

const cleanText = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);

function link(v, label) {
  const s = cleanText(v, 200);
  if (!s) return { ok: true, value: '' };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: `${label} must be a full https:// link.` };
  }
  if (u.protocol !== 'https:') return { ok: false, error: `${label} must start with https://` };
  return { ok: true, value: u.toString() };
}

/** Returns { ok: true, value } with cleaned fields, or { ok: false, error } with a message a person can act on. */
export function validateLaunch(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Missing request.' };
  if (!looksLikeAddress(body.wallet)) return { ok: false, error: 'Connect a wallet first.' };
  const name = cleanText(body.name, 64);
  if (!name || name.length > 32 || CTRL.test(name)) return { ok: false, error: 'Name is required, up to 32 characters.' };
  const symbol = cleanText(body.symbol, 20).toUpperCase().replace(/^\$/, '');
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return { ok: false, error: 'Ticker must be 2 to 10 letters or numbers.' };
  const description = cleanText(body.description, 600);
  if (description.length > 500 || CTRL.test(description.replace(/[\n\r\t]/g, ' '))) return { ok: false, error: 'Description is up to 500 characters.' };
  const links = {};
  for (const [key, label] of [['website', 'Website'], ['twitter', 'X link'], ['telegram', 'Telegram link']]) {
    const r = link(body[key], label);
    if (!r.ok) return r;
    links[key] = r.value;
  }
  if (typeof body.image !== 'string' || !body.image.startsWith('data:')) return { ok: false, error: 'Add a token image.' };
  return { ok: true, value: { wallet: body.wallet, name, symbol, description, links, image: body.image } };
}

/** Decodes a data: URL and checks the file really is a PNG, JPEG or WebP (never SVG: it can carry scripts). */
export function decodeImage(dataUrl, maxBytes) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: 'The image must be a PNG, JPEG or WebP file.' };
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) return { ok: false, error: 'The image is empty.' };
  if (bytes.length > maxBytes) return { ok: false, error: `The image is too large (limit ${Math.round(maxBytes / 1000)} KB).` };
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const kind = isPng ? 'png' : isJpg ? 'jpg' : isWebp ? 'webp' : '';
  const claimed = m[1] === 'image/png' ? 'png' : m[1] === 'image/jpeg' ? 'jpg' : 'webp';
  if (!kind || kind !== claimed) return { ok: false, error: 'The file does not look like the image type it claims to be.' };
  return { ok: true, bytes, ext: kind, mime: m[1] };
}

export const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
