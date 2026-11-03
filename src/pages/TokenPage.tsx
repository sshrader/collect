import { useEffect, useState } from 'react';
import { getToken, type TokenView } from '../lib/api';
import { explorer, short } from '../lib/config';

export function TokenPage({ keyId }: { keyId: string }) {
  const [t, setT] = useState<TokenView | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    getToken(keyId).then(setT).catch((e) => setError(e.message));
  }, [keyId]);
  if (error) return <section className="narrow"><p className="err">{error}</p><a href="#/">Back to all tokens</a></section>;
  if (!t) return <section className="narrow"><p className="dim">Loading...</p></section>;
  const copy = () => navigator.clipboard?.writeText(t.mint).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  return (
    <section className="narrow">
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
      <p className="dim small">Live price, curve progress and a trade button are the next piece to build (see the README roadmap).</p>
    </section>
  );
}
