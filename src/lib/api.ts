export type TokenView = {
  id: string;
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  description: string;
  links: { website?: string; twitter?: string; telegram?: string };
  image: string;
  status: 'pending' | 'live';
  signature: string | null;
  launchedAt: number | null;
  collection: Collection | null;
};

export type Slot = { n: number; name: string; attributes: { label: string; value: string }[]; image: string | null; owner: string | null; asset: string | null; minting: boolean };
export type Collection = { theme: string; size: number; state: 'generating' | 'open'; minPct: number; minTokens: number; ready: number; claimed: number; slots: Slot[] };
export type TraitRow = { label: string; options: string };
export type AppConfig = { ready: boolean; cluster: string; maxDevBuy: number; launchFee: number; slots: number; realArt: boolean; minting: boolean };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const getConfig = () => call<AppConfig>('/api/config');
export const listTokens = (q = '') => call<{ tokens: TokenView[] }>(`/api/tokens?q=${encodeURIComponent(q)}`);
export const getToken = (key: string) => call<TokenView>(`/api/tokens/${encodeURIComponent(key)}`);
export const previewCollection = (name: string, collection: unknown) => call<{ slots: Pick<Slot, 'n' | 'name' | 'attributes'>[] }>('/api/collection/preview', { name, collection });
export const prepareLaunch = (form: Record<string, unknown>) => call<{ id: string; mint: string; transaction: string }>('/api/launch/prepare', form);
export const confirmLaunch = (id: string, signature: string) => call<TokenView>('/api/launch/confirm', { id, signature });
