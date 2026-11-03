import { useMemo, useState } from 'react';
import { Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { confirmLaunch, getConfig, prepareLaunch, previewCollection, type AppConfig, type Slot, type TraitRow } from '../lib/api';
import { useEffect } from 'react';

const MAX_IMAGE = 1_000_000;
const EXAMPLE: TraitRow[] = [
  { label: 'Species', options: 'frog, toad, newt, axolotl' },
  { label: 'Hat', options: 'helmet, crown, beanie, hard hat, cap' },
  { label: 'Item', options: 'pickaxe, torch, gem' },
  { label: 'Mood', options: 'grumpy, happy' },
];

const toDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(f);
  });

const list = (s: string) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];

export function Create() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [f, setF] = useState({ name: '', symbol: '', description: '', website: '', twitter: '', telegram: '', devBuy: '0', minPct: '0.1' });
  const [theme, setTheme] = useState('');
  const [style, setStyle] = useState('');
  const [traits, setTraits] = useState<TraitRow[]>([{ label: '', options: '' }, { label: '', options: '' }]);
  const [preview, setPreview] = useState<Pick<Slot, 'n' | 'name' | 'attributes'>[] | null>(null);
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { getConfig().then(setCfg).catch(() => {}); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const collection = useMemo(() => ({ theme, style, traits: traits.map((t) => ({ label: t.label, options: list(t.options) })) }), [theme, style, traits]);
  const combos = useMemo(() => collection.traits.filter((t) => t.label && t.options.length).reduce((n, t) => n * t.options.length, 1), [collection]);
  const filled = collection.traits.filter((t) => t.label && t.options.length).length;
  const enough = filled >= 2 && combos >= 40;
  const setRow = (i: number, k: keyof TraitRow, v: string) => { setTraits(traits.map((t, j) => (j === i ? { ...t, [k]: v } : t))); setPreview(null); };

  async function pick(file?: File) {
    setError('');
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError('Use a PNG, JPEG or WebP picture.');
    if (file.size > MAX_IMAGE) return setError('The picture is over 1 MB. Use a smaller one.');
    setImage({ url: await toDataUrl(file), name: file.name });
  }

  async function showPreview() {
    setError('');
    try {
      setBusy('Building the 40...');
      setPreview((await previewCollection(f.name || 'Name', collection)).slots);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!publicKey) return setError('Connect your wallet first.');
    if (!image) return setError('Add a coin picture.');
    try {
      const c = await getConfig();
      if (!c.ready) throw new Error('The launchpad is not set up yet. Try again later.');
      setBusy('Preparing your coin...');
      const prep = await prepareLaunch({ ...f, wallet: publicKey.toBase58(), image: image.url, collection });
      setBusy('Approve the transaction in your wallet...');
      const tx = Transaction.from(Uint8Array.from(atob(prep.transaction), (ch) => ch.charCodeAt(0)));
      const signature = await sendTransaction(tx, connection);
      setBusy('Confirming on the network...');
      let last = '';
      for (let i = 0; i < 20; i++) {
        try {
          await confirmLaunch(prep.id, signature);
          window.location.hash = `#/token/${prep.id}`;
          return;
        } catch (err) {
          last = (err as Error).message;
          if (!/not confirmed yet/i.test(last)) throw err;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      throw new Error(last || 'Timed out waiting for confirmation. Your transaction may still go through: check your wallet.');
    } catch (err) {
      setError((err as Error).message || 'Launch failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="narrow">
      <h1>Launch a coin</h1>
      <p className="dim">You pay the network fees from your wallet. The name, ticker, picture and collectible traits are permanent once the coin exists.</p>
      {cfg && !cfg.realArt && <p className="banner">Test mode: the 40 pictures will be simple placeholders until an image service is connected.</p>}
      <form onSubmit={launch}>
        <h2>The coin</h2>
        <label htmlFor="name">Name</label>
        <input id="name" value={f.name} onChange={set('name')} maxLength={32} placeholder="Space Frogs" required />
        <label htmlFor="symbol">Ticker</label>
        <input id="symbol" value={f.symbol} onChange={set('symbol')} maxLength={10} placeholder="FROG" required />
        <label htmlFor="image">Coin picture (PNG, JPEG or WebP, up to 1 MB)</label>
        <input id="image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
        {image && <img className="preview" src={image.url} alt="Preview of your coin picture" width={96} height={96} />}
        <label htmlFor="description">Description</label>
        <textarea id="description" value={f.description} onChange={set('description')} maxLength={500} rows={3} placeholder="What is this coin about?" />
        <label htmlFor="website">Website (optional)</label>
        <input id="website" value={f.website} onChange={set('website')} placeholder="https://" inputMode="url" />
        <label htmlFor="twitter">X link (optional)</label>
        <input id="twitter" value={f.twitter} onChange={set('twitter')} placeholder="https://x.com/..." inputMode="url" />
        <label htmlFor="telegram">Telegram link (optional)</label>
        <input id="telegram" value={f.telegram} onChange={set('telegram')} placeholder="https://t.me/..." inputMode="url" />
        <label htmlFor="devBuy">Dev buy in SOL (optional{cfg ? `, up to ${cfg.maxDevBuy}` : ''})</label>
        <input id="devBuy" value={f.devBuy} onChange={set('devBuy')} inputMode="decimal" placeholder="0" />
        <p className="dim small">Bought in the same transaction that creates the coin, so nobody can buy before you.</p>

        <h2>The 40 collectibles</h2>
        <p className="dim small">Describe the characters. Collect combines your trait lists into 40 different characters (no two alike) and draws each one. Holders who qualify are sent one as an NFT.</p>
        <label htmlFor="theme">Theme</label>
        <input id="theme" value={theme} onChange={(e) => { setTheme(e.target.value); setPreview(null); }} maxLength={100} placeholder="space frogs on a mining crew" />
        <label htmlFor="style">Art style (optional)</label>
        <input id="style" value={style} onChange={(e) => { setStyle(e.target.value); setPreview(null); }} maxLength={160} placeholder="flat vector sticker art, bold outlines" />
        <label>Trait lists (2 to 5, each with at least 2 options, separated by commas)</label>
        {traits.map((t, i) => (
          <div className="traitrow" key={i}>
            <input aria-label={`Trait ${i + 1} name`} value={t.label} onChange={(e) => setRow(i, 'label', e.target.value)} maxLength={20} placeholder="Hat" />
            <input aria-label={`Trait ${i + 1} options`} value={t.options} onChange={(e) => setRow(i, 'options', e.target.value)} placeholder="helmet, crown, beanie" />
          </div>
        ))}
        <div className="links">
          {traits.length < 5 && <button type="button" className="btn" onClick={() => setTraits([...traits, { label: '', options: '' }])}>Add a trait list</button>}
          <button type="button" className="btn" onClick={() => { setTraits(EXAMPLE); setTheme('space frogs on a mining crew'); setPreview(null); }}>Fill with an example</button>
        </div>
        <p className={enough ? 'ok' : 'dim'}>{filled < 2 ? 'Fill in at least two trait lists.' : `${combos} different characters possible${enough ? '.' : ': you need at least 40.'}`}</p>
        <button type="button" className="btn" disabled={!enough || theme.trim().length < 3 || !!busy} onClick={showPreview}>Preview the 40</button>
        {preview && (
          <ol className="roster">
            {preview.map((s) => <li key={s.n}><b>{s.name}</b> {s.attributes.map((a) => a.value).join(' · ')}</li>)}
          </ol>
        )}
        <label htmlFor="minPct">Holding needed to claim one (% of supply)</label>
        <select id="minPct" value={f.minPct} onChange={set('minPct')}>
          {['0.05', '0.1', '0.25', '0.5', '1'].map((v) => <option key={v} value={v}>{v}% ({(10_000_000 * Number(v)).toLocaleString()} coins)</option>)}
        </select>
        {cfg && cfg.launchFee > 0 && <p className="dim small">Launch fee: {cfg.launchFee} SOL, which pays for drawing the 40 pictures.</p>}

        {error && <p className="err" role="alert">{error}</p>}
        {publicKey ? (
          <button className="btn primary" type="submit" disabled={!!busy || !enough}>{busy || 'Launch coin'}</button>
        ) : (
          <WalletMultiButton>Connect wallet to launch</WalletMultiButton>
        )}
      </form>
    </section>
  );
}
