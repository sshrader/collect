import { useState } from 'react';
import { Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { confirmLaunch, getConfig, prepareLaunch } from '../lib/api';

const MAX_IMAGE = 1_000_000;

const toDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(f);
  });

export function Create() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [f, setF] = useState({ name: '', symbol: '', description: '', website: '', twitter: '', telegram: '' });
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function pick(file?: File) {
    setError('');
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError('Use a PNG, JPEG or WebP picture.');
    if (file.size > MAX_IMAGE) return setError('The picture is over 1 MB. Use a smaller one.');
    setImage({ url: await toDataUrl(file), name: file.name });
  }

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!publicKey) return setError('Connect your wallet first.');
    if (!image) return setError('Add a token picture.');
    try {
      const cfg = await getConfig();
      if (!cfg.ready) throw new Error('The launchpad is not set up yet. Try again later.');
      setBusy('Preparing your token...');
      const prep = await prepareLaunch({ ...f, wallet: publicKey.toBase58(), image: image.url });
      setBusy('Approve the transaction in your wallet...');
      const tx = Transaction.from(Uint8Array.from(atob(prep.transaction), (c) => c.charCodeAt(0)));
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
      <h1>Launch a token</h1>
      <p className="dim">You pay the network fees from your wallet. The name, ticker and picture are permanent once the token exists.</p>
      <form onSubmit={launch}>
        <label htmlFor="name">Name</label>
        <input id="name" value={f.name} onChange={set('name')} maxLength={32} placeholder="Pay Dirt" required />
        <label htmlFor="symbol">Ticker</label>
        <input id="symbol" value={f.symbol} onChange={set('symbol')} maxLength={10} placeholder="DIRT" required />
        <label htmlFor="image">Picture (PNG, JPEG or WebP, up to 1 MB)</label>
        <input id="image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
        {image && <img className="preview" src={image.url} alt="Preview of your token picture" width={96} height={96} />}
        <label htmlFor="description">Description</label>
        <textarea id="description" value={f.description} onChange={set('description')} maxLength={500} rows={3} placeholder="What is this token about?" />
        <label htmlFor="website">Website (optional)</label>
        <input id="website" value={f.website} onChange={set('website')} placeholder="https://" inputMode="url" />
        <label htmlFor="twitter">X link (optional)</label>
        <input id="twitter" value={f.twitter} onChange={set('twitter')} placeholder="https://x.com/..." inputMode="url" />
        <label htmlFor="telegram">Telegram link (optional)</label>
        <input id="telegram" value={f.telegram} onChange={set('telegram')} placeholder="https://t.me/..." inputMode="url" />
        {error && <p className="err" role="alert">{error}</p>}
        {publicKey ? (
          <button className="btn primary" type="submit" disabled={!!busy}>{busy || 'Launch token'}</button>
        ) : (
          <WalletMultiButton>Connect wallet to launch</WalletMultiButton>
        )}
      </form>
    </section>
  );
}
