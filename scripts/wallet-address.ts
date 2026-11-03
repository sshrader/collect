/**
 * Prints the PUBLIC address of a wallet key file. Never prints the secret key.
 *   npm run wallet-address -- C:\temp\keys\trenches-deployer.json
 * With no path, uses PARTNER_KEYPAIR from .env (or .devnet-keypair.json).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';

const file = path.resolve(process.argv[2] || process.env.PARTNER_KEYPAIR || '.devnet-keypair.json');
if (!fs.existsSync(file)) throw new Error(`No file at ${file}`);
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, 'utf8'))));
console.log(`File:    ${file}`);
console.log(`Address: ${kp.publicKey.toBase58()}`);
