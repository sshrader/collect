import { useEffect, useState } from 'react';
import { listTokens, type TokenView } from '../lib/api';
import { short } from '../lib/config';

export function Home() {
  const [q, setQ] = useState('');
  const [tokens, setTokens] = useState<TokenView[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = setTimeout(() => listTokens(q).then((r) => { setTokens(r.tokens); setError(''); }).catch((e) => setError(e.message)), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <section>
      <div className="hero">
        <span className="tag"><i></i>Devnet · building in public</span>
        <h1><span className="neon">A coin with</span><br /><span className="alt">40 collectibles</span></h1>
        <p>Launch a coin on a Meteora bonding curve, with an optional dev buy. Describe your characters and Collect draws 40 unique ones. Each holder who qualifies is sent one as an NFT, and only one wallet can own each.</p>
        <a className="btn primary" href="#/create">Launch a coin</a>
      </div>
      <div className="label"><b>01</b> Coins</div>
      <input className="search" placeholder="Search name, ticker or mint" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tokens" />
      {error && <p className="err">{error}</p>}
      {tokens && tokens.length === 0 && <p className="dim">{q ? 'No tokens match that search.' : 'No tokens launched yet. Be the first.'}</p>}
      <div className="grid">
        {(tokens ?? []).map((t) => (
          <a key={t.id} className="card token" href={`#/token/${t.id}`}>
            <img src={t.image} alt="" width={64} height={64} loading="lazy" />
            <div>
              <h3>{t.name} <span className="sym">${t.symbol}</span></h3>
              <p className="dim">{t.description || 'No description.'}</p>
              <small>by {short(t.creator)}{t.collection ? ` · ${t.collection.claimed}/40 claimed` : ''}</small>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
