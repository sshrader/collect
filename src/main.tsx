import { Buffer } from 'buffer';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@solana/wallet-adapter-react-ui/styles.css';
import { App } from './App';
import './styles.css';

(window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer; // web3.js expects Node's Buffer in the browser

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
