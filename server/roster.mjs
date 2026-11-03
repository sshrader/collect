// Turns the creator's description of their collectibles into exactly 40 different characters.
// Pure code (no network), so it is tested anywhere.
//
// The creator gives: a theme, an art style, and 2-5 trait lists (for example "Species: frog, fox, owl").
// We take every combination of one option per list, shuffle them with a seed, and keep 40. Each one is a
// unique combination, so no two characters are alike, and each gets a text prompt for the image model.
import crypto from 'node:crypto';

export const SLOTS = 40;
const CTRL = /[\u0000-\u001f\u007f<>]/;
export const DEFAULT_STYLE = 'flat vector sticker art, bold clean outlines, one centered full-body character, plain solid background, no text';

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, max);

/** How many different characters the trait lists can make (the product of the list sizes). */
export const combos = (traits) => traits.reduce((n, t) => n * Math.max(1, t.options.length), 1);

/** Returns { ok, value: { theme, style, traits: [{label, options[]}] } } or { ok:false, error }. */
export function validateCollection(c) {
  if (!c || typeof c !== 'object') return { ok: false, error: 'Describe your collectibles first.' };
  const theme = clean(c.theme, 100);
  if (theme.length < 3 || CTRL.test(theme)) return { ok: false, error: 'Give the collectibles a theme (3 to 100 characters), for example "space frogs on a mining crew".' };
  const style = clean(c.style, 160) || DEFAULT_STYLE;
  if (CTRL.test(style)) return { ok: false, error: 'The art style has characters that are not allowed.' };
  if (!Array.isArray(c.traits)) return { ok: false, error: 'Add at least two trait lists.' };
  const traits = [];
  const seen = new Set();
  for (const t of c.traits.slice(0, 5)) {
    const label = clean(t?.label, 20);
    const options = [];
    const dup = new Set();
    for (const o of Array.isArray(t?.options) ? t.options : []) {
      const v = clean(o, 28);
      if (!v) continue;
      if (CTRL.test(v)) return { ok: false, error: `"${label || 'A trait'}" has characters that are not allowed.` };
      if (!dup.has(v.toLowerCase())) {
        dup.add(v.toLowerCase());
        options.push(v);
      }
    }
    if (!label && !options.length) continue; // an empty row is just skipped
    if (!label || CTRL.test(label)) return { ok: false, error: 'Every trait list needs a name, like "Hat" or "Species".' };
    if (seen.has(label.toLowerCase())) return { ok: false, error: `Two trait lists are both called "${label}".` };
    seen.add(label.toLowerCase());
    if (options.length < 2) return { ok: false, error: `"${label}" needs at least 2 options.` };
    if (options.length > 12) return { ok: false, error: `"${label}" has more than 12 options.` };
    traits.push({ label, options });
  }
  if (traits.length < 2) return { ok: false, error: 'Add at least two trait lists.' };
  const n = combos(traits);
  if (n < SLOTS) return { ok: false, error: `Your lists only make ${n} different characters. You need at least ${SLOTS}: add more options.` };
  return { ok: true, value: { theme, style, traits } };
}

// A small seeded random generator so the same seed always gives the same 40.
function rng(seed) {
  let s = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

/** Picks 40 different combinations. Returns slots numbered 1..40. */
export function buildRoster(spec, coinName, seed) {
  const rand = rng(seed);
  const total = combos(spec.traits);
  const picked = new Set();
  // Sample combination numbers without repeats. (Fisher-Yates on a lazy range, so a big product stays cheap.)
  const swapped = new Map();
  const at = (i) => (swapped.has(i) ? swapped.get(i) : i);
  for (let i = 0; i < SLOTS; i++) {
    const j = i + Math.floor(rand() * (total - i));
    const vi = at(i);
    const vj = at(j);
    swapped.set(j, vi);
    swapped.set(i, vj);
    picked.add(vj);
  }
  return [...picked].map((idx, k) => {
    let rest = idx;
    const values = spec.traits.map((t) => {
      const v = t.options[rest % t.options.length];
      rest = Math.floor(rest / t.options.length);
      return { label: t.label, value: v };
    });
    return {
      n: k + 1,
      name: `${coinName} #${k + 1}`,
      attributes: values,
      prompt: promptFor(spec, values),
      status: 'pending',
      attempts: 0,
    };
  });
}

export function promptFor(spec, values) {
  const traitText = values.map((v) => `${v.label}: ${v.value}`).join('; ');
  return `${spec.style}. A collectible character for a series themed "${spec.theme}". Traits - ${traitText}. Make this exact combination of traits clearly visible. No text, letters or logos in the image.`;
}
