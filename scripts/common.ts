// Shared by the partner scripts: which wallet signs, and which network we are on.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';

export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

/** Partner wallet file. Default is the devnet test wallet. For mainnet set PARTNER_KEYPAIR to a file kept OUTSIDE the repo. */
export const KEY_FILE = path.resolve(process.env.PARTNER_KEYPAIR || '.devnet-keypair.json');

export function loadPartner(): Keypair {
  if (!fs.existsSync(KEY_FILE)) throw new Error(`No wallet file at ${KEY_FILE}. Set PARTNER_KEYPAIR in .env (or run \`npm run dry-run -- --send\` for a devnet wallet).`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))));
}

export const rpcUrl = () => process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');

/** Connection plus whether it is mainnet (decided by the chain's genesis hash, not by the URL). */
export async function connect(): Promise<{ connection: Connection; mainnet: boolean }> {
  const connection = new Connection(rpcUrl(), 'confirmed');
  const mainnet = (await connection.getGenesisHash()) === MAINNET_GENESIS;
  console.log(`Network: ${mainnet ? 'MAINNET (real money)' : 'devnet/testnet'}`);
  return { connection, mainnet };
}

/** Spending real SOL needs an explicit --confirm-mainnet flag. */
export function requireMainnetConfirm(mainnet: boolean, what: string) {
  if (mainnet && !process.argv.includes('--confirm-mainnet')) {
    throw new Error(`${what} on MAINNET spends real SOL. Re-run with --confirm-mainnet once you have checked the settings above.`);
  }
}

/** Who may claim trading fees (and receives leftover tokens). DBC_FEE_CLAIMER = a safe wallet (hardware wallet or multisig
 *  address) that does NOT live in a key file. Empty = the key-file wallet itself, which is fine on devnet only. */
export function feeClaimerFor(deployer: Keypair): PublicKey {
  const v = (process.env.DBC_FEE_CLAIMER || '').trim();
  if (!v) return deployer.publicKey;
  try {
    return new PublicKey(v);
  } catch {
    throw new Error('DBC_FEE_CLAIMER is not a valid Solana address.');
  }
}
