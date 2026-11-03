import { useEffect, useMemo, useState } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { RPC, CLUSTER } from './lib/config';
import { Home } from './pages/Home';
import { Create } from './pages/Create';
import { TokenPage } from './pages/TokenPage';

/** Hash routing: #/ (list), #/create, #/token/<id or mint>. */
function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '').split('/').filter(Boolean);
}

export function App() {
  const wallets = useMemo(() => [], []); // wallets that follow the Wallet Standard (Phantom, Solflare, Backpack...) appear on their own
  const route = useRoute();
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <header className="top">
            <a className="brand" href="#/">collect<b>.</b></a>
            <nav>
              <a href="#/">Coins</a>
              <a href="#/create" className="primary">Launch a coin</a>
              <WalletMultiButton />
            </nav>
          </header>
          {CLUSTER === 'devnet' && <div className="banner">Test network (devnet): tokens here have no real value.</div>}
          <main>
            {route[0] === 'create' ? <Create /> : route[0] === 'token' && route[1] ? <TokenPage keyId={route[1]} /> : <Home />}
          </main>
          <footer>Anyone can launch a token here. Tokens are risky and can lose all their value. Nothing on this site is financial advice.</footer>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
