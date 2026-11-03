import { clusterApiUrl } from '@solana/web3.js';

export const CLUSTER = (import.meta.env.VITE_CLUSTER as 'devnet' | 'mainnet-beta' | undefined) || 'devnet';
export const RPC = (import.meta.env.VITE_RPC_URL as string | undefined) || clusterApiUrl(CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet');
export const explorer = (kind: 'tx' | 'address', v: string) => `https://solscan.io/${kind === 'tx' ? 'tx' : 'account'}/${v}${CLUSTER === 'devnet' ? '?cluster=devnet' : ''}`;
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
