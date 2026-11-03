// Makes the picture for one collectible.
//
// Real images need an image model. Set IMAGE_API_KEY (and optionally IMAGE_API_URL / IMAGE_MODEL) and every
// character is drawn from its text prompt through an OpenAI-style /v1/images/generations endpoint.
// With no key, a clearly-labelled placeholder is drawn instead so the whole flow can be tested for free.
import crypto from 'node:crypto';

const KEY = (process.env.IMAGE_API_KEY || '').trim();
const URL_ = process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
const MODEL = process.env.IMAGE_MODEL || 'gpt-image-2.5-flare';
const SIZE = process.env.IMAGE_SIZE || '1024x1024';
const QUALITY = (process.env.IMAGE_QUALITY || '').trim(); // low | medium | high; empty = the service default
const PROVIDER = (process.env.IMAGE_PROVIDER || 'openai').toLowerCase(); // openai | gemini
const MAX_BYTES = 6_000_000;

export const usingAi = () => !!KEY;

const isPng = (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Google's Gemini image models (free tier in Google AI Studio). Key from aistudio.google.com. */
async function fromGemini(prompt) {
  const model = process.env.IMAGE_MODEL || 'gemini-2.5-flash-image';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`image service answered ${res.status}`);
  const j = await res.json();
  const part = (j?.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData?.data || x.inline_data?.data);
  const b64 = part?.inlineData?.data || part?.inline_data?.data;
  if (!b64) throw new Error('image service returned no image (the prompt may have been blocked)');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > MAX_BYTES) throw new Error('image is too large');
  if (!isPng(bytes)) throw new Error('image service did not return a PNG');
  return { bytes, ext: 'png' };
}

async function fromAi(prompt) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size: SIZE, ...(QUALITY ? { quality: QUALITY } : {}) }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`image service answered ${res.status}`);
  const j = await res.json();
  const item = j?.data?.[0];
  let bytes;
  if (item?.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
  else if (item?.url && /^https:\/\//.test(item.url)) {
    const r = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error('could not download the image');
    bytes = Buffer.from(await r.arrayBuffer());
  } else throw new Error('image service returned no image');
  if (bytes.length > MAX_BYTES) throw new Error('image is too large');
  if (!isPng(bytes)) throw new Error('image service did not return a PNG');
  return { bytes, ext: 'png' };
}

/** Test art: a colourful creature made from the slot's own hash. Contains no user text. */
export function placeholder(slot, seed = '') {
  const h = crypto.createHash('sha256').update(`${seed}:${slot.n}:${slot.attributes.map((a) => a.value).join('|')}`).digest();
  const hue = (i) => Math.round((h[i] / 255) * 360);
  const bg = `hsl(${hue(0)} 55% 22%)`;
  const body = `hsl(${hue(1)} 70% 55%)`;
  const accent = `hsl(${hue(2)} 80% 62%)`;
  const eyes = 1 + (h[3] % 3);
  const horns = h[4] % 3;
  const mouth = h[5] % 3;
  const bodyW = 130 + (h[6] % 50);
  const eyeXs = eyes === 1 ? [256] : eyes === 2 ? [212, 300] : [180, 256, 332];
  const parts = [`<rect width="512" height="512" fill="${bg}"/>`, `<ellipse cx="256" cy="330" rx="${bodyW}" ry="${150}" fill="${body}"/>`];
  if (horns) for (const x of horns === 1 ? [256] : [190, 322]) parts.push(`<polygon points="${x - 22},210 ${x},140 ${x + 22},210" fill="${accent}"/>`);
  for (const x of eyeXs) parts.push(`<circle cx="${x}" cy="290" r="26" fill="#fff"/><circle cx="${x + 4}" cy="292" r="12" fill="#111"/>`);
  parts.push(mouth === 0 ? `<path d="M206 380 Q256 420 306 380" stroke="#111" stroke-width="10" fill="none" stroke-linecap="round"/>` : mouth === 1 ? `<rect x="216" y="372" width="80" height="22" rx="8" fill="#111"/>` : `<circle cx="256" cy="388" r="16" fill="#111"/>`);
  parts.push(`<text x="256" y="486" font-family="monospace" font-size="28" fill="#ffffffaa" text-anchor="middle">TEST ART #${slot.n}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${parts.join('')}</svg>`;
  return { bytes: Buffer.from(svg), ext: 'svg' };
}

/** Draws one slot. `seed` should be the coin id so placeholders differ per coin. */
export async function render(slot, seed) {
  if (!KEY) return placeholder(slot, seed);
  return PROVIDER === 'gemini' ? fromGemini(slot.prompt) : fromAi(slot.prompt);
}
