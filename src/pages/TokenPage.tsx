import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getToken, type TokenView } from '../lib/api';
import { explorer, short } from '../lib/config';

export function TokenPage({ keyId }: { keyId: string }) {
  const { publicKey } = useWallet();
  const me = publicKey?.toBase58();
  const [t, setT] = useState<TokenView | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => getToken(keyId).then((x) => alive && setT(x)).catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 8000); // pictures appear and collectibles get claimed while you watch
    return () => { alive = false; clearInterval(timer); };
  }, [keyId]);
  if (error && !t) return <section className="narrow"><p className="err">{error}</p><a href="#/">Back to all coins</a></section>;
  if (!t) return <section className="narrow"><p className="dim">Loading...</p></section>;
  const copy = () => navigator.clipboard?.writeText(t.mint).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  const c = t.collection;
  const mine = c?.slots.filter((s) => s.owner && s.owner === me) ?? [];
  return (
    <section>
      <div className="tokenhead">
        <img src={t.image} alt="" width={120} height={120} />
        <div>
          <h1>{t.name} <span className="sym">${t.symbol}</span></h1>
          <p className="dim">Created by <a href={explorer('address', t.creator)} target="_blank" rel="noopener noreferrer">{short(t.creator)}</a></p>
        </div>
      </div>
      {t.description && <p>{t.description}</p>}
      <div className="mint">
        <code>{t.mint}</code>
        <button className="btn" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
      <div className="links">
        <a className="btn" href={explorer('address', t.mint)} target="_blank" rel="noopener noreferrer">View on Solscan</a>
        {t.signature && <a className="btn" href={explorer('tx', t.signature)} target="_blank" rel="noopener noreferrer">Launch transaction</a>}
        {t.links.website && <a className="btn" href={t.links.website} target="_blank" rel="noopener noreferrer">Website</a>}
        {t.links.twitter && <a className="btn" href={t.links.twitter} target="_blank" rel="noopener noreferrer">X</a>}
        {t.links.telegram && <a className="btn" href={t.links.telegram} target="_blank" rel="noopener noreferrer">Telegram</a>}
      </div>

      {c && (
        <>
          <h2>The {c.size} collectibles <span className="dim small">{c.theme}</span></h2>
          {c.state === 'generating' ? (
            <p className="card">Drawing the characters: {c.ready} of {c.size} done. Claiming opens when all {c.size} are ready.</p>
          ) : (
            <p className="card">
              <b>Claiming is open: {c.claimed} of {c.size} taken.</b> Hold at least <b>{c.minTokens.toLocaleString()}</b> {t.symbol} ({c.minPct}% of the supply) in a normal wallet for about two minutes and one character is picked for you and sent to that wallet as an NFT. One per wallet. It stays yours even if you sell the coin, and only one wallet can own each character.
            </p>
          )}
          {mine.length > 0 && <p className="ok">You own {mine.map((s) => s.name).join(', ')}.</p>}
          <div className="nfts">
            {c.slots.map((s) => (
              <figure key={s.n} className={`nft${s.owner ? ' taken' : ''}${s.owner && s.owner === me ? ' mine' : ''}`}>
                {s.image ? <img src={s.image} alt={`${s.name}: ${s.attributes.map((a) => a.value).join(', ')}`} loading="lazy" width={200} height={200} /> : <div className="blank" aria-label="Still being drawn">...</div>}
                <figcaption>
                  <b>{s.name}</b>
                  <small>{s.attributes.map((a) => a.value).join(' · ')}</small>
                  <small className={s.owner ? 'own' : 'dim'}>{s.owner ? `Owner ${short(s.owner)}` : 'Unclaimed'}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      <p className="dim small">Live price, curve progress and a trade button are still to build (see the README roadmap).</p>
    </section>
  );
}
