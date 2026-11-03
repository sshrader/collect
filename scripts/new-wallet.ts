/**
 * Makes a brand-new wallet key file for the DEPLOYER (the wallet that pays to create the mainnet config).
 *   npm run new-wallet -- C:\keys\trenches-deployer.json
 * Prints the public address to fund. The file is the secret key: keep it OUTSIDE this repo, back it up, never share it.
 * Then set PARTNER_KEYPAIR=<that path> in your local .env. (The fee claimer is a different wallet: DBC_FEE_CLAIMER.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';

const target = process.argv[2];
if (!target) throw new Error('Usage: npm run new-wallet -- <path for the new key file, outside this repo>');
const file = path.resolve(target);
const repo = path.resolve('.');
if (file === repo || file.startsWith(repo + path.sep)) {
  throw new Error('Pick a path OUTSIDE the project folder, so the key can never be committed to GitHub.');
}
if (fs.existsSync(file)) throw new Error(`${file} already exists. Not overwriting it.`);

const kp = Keypair.generate();
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
console.log(`\nNew deployer wallet: ${kp.publicKey.toBase58()}`);
console.log(`Key file: ${file}`);
console.log('\nBack this file up somewhere safe (it cannot be recovered). Then add to your local .env:');
console.log(`PARTNER_KEYPAIR=${file}`);
