// Background worker: draws the 40 pictures for every coin that is still waiting, a couple at a time,
// retrying failures. When all 40 are drawn the coin's collectibles open for claiming.
// It resumes by itself after a restart, because the state lives in the store.
import * as store from './store.mjs';

const MAX_ATTEMPTS = 4;

/** One pass. `art.render(slot, seed)` is injected so tests can use a fake. Returns how many pictures it drew. */
export async function pass({ art, concurrency = 2, now = Date.now() } = {}) {
  let drawn = 0;
  for (const t of store.all()) {
    if (t.status !== 'live' || !t.collection || t.collection.state !== 'generating') continue;
    const todo = t.collection.slots.filter((s) => s.status !== 'ready' && s.attempts < MAX_ATTEMPTS && now >= (s.retryAt || 0));
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const slot = todo[i++];
        try {
          const img = await art.render(slot, t.id);
          store.saveNft(t, slot.n, img.ext, img.bytes);
          store.update(t.id, (x) => {
            const s = x.collection.slots.find((y) => y.n === slot.n);
            s.status = 'ready';
            s.ext = img.ext;
          });
          drawn++;
        } catch (e) {
          console.error(`art ${t.symbol} #${slot.n} failed:`, e.message);
          store.update(t.id, (x) => {
            const s = x.collection.slots.find((y) => y.n === slot.n);
            s.attempts++;
            s.retryAt = now + 30_000 * s.attempts;
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
    if (t.collection.slots.every((s) => s.status === 'ready')) store.update(t.id, (x) => { x.collection.state = 'open'; x.collection.openedAt = now; });
  }
  return drawn;
}

let running = false;
export function start(art, everyMs = 5000) {
  // A restart gives every unfinished picture a fresh set of tries (so fixing the key and restarting is enough).
  for (const t of store.all()) {
    if (t.collection?.state !== 'generating') continue;
    store.update(t.id, (x) => x.collection.slots.forEach((s) => { if (s.status !== 'ready') { s.attempts = 0; s.retryAt = 0; } }));
  }
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pass({ art });
    } catch (e) {
      console.error('art queue error:', e);
    } finally {
      running = false;
    }
  };
  setInterval(tick, everyMs).unref();
  return tick;
}
