# Collect

A small token launchpad on Solana, built on Meteora's Dynamic Bonding Curve (DBC). A visitor connects a wallet, fills in a name, ticker and picture, signs one transaction, and their token starts trading on a bonding curve that you configured. You earn the partner share of the trading fees.

**Status: first scaffold.** The server checks and tests run (`npm test`), and every file parses, but nothing has been installed, compiled or run against devnet yet. Expect a few small fixes on the first real run.

## How it works

1. **You, once:** make a bonding-curve *config* on Meteora (`npm run dbc-config`). It fixes the curve, the fee, who can claim fees (the "fee claimer", ideally a hardware wallet), and what happens at graduation. Every token launched here is a pool made from that config.
2. **A visitor:** the site sends the form to `POST /api/launch/prepare`. The server checks it, saves the picture and details, and builds the `createPool` transaction with the visitor as payer and creator. The new token's own key (the mint) is added by the server and never stored. The visitor's wallet adds its signature and sends it.
3. **Confirm:** the site calls `POST /api/launch/confirm` with the signature. The server loads the transaction from the chain, checks it succeeded and was this launch (right payer, right mint), and only then lists the token.
4. **Metadata:** each token's on-chain link points at `PUBLIC_URL/meta/<id>.json`, which points at `PUBLIC_URL/img/<id>`. **These must keep working for as long as the token exists.** Use a persistent volume (`DATA_DIR`) and a stable domain.

## Run it (devnet)

```
npm install
npm test
cp .env.example .env
npm run new-wallet              # makes .devnet-keypair.json; fund it at https://faucet.solana.com
npm run dbc-config -- --check   # print the curve and fee, send nothing
npm run dbc-config              # create it; copy the two DBC_CONFIG lines into .env
npm run dev                     # http://localhost:5173
```

On Railway: build `npm install && npm run build`, start `npm start`, health check `/api/health`. Set `PUBLIC_URL` to your real address, `DBC_CONFIG`, `SOLANA_RPC_URL`, `TRUST_PROXY=1`, and mount a volume with `DATA_DIR=/data`.

## Settings you can change (in `.env`, before `npm run dbc-config`)

| Variable | Meaning |
|---|---|
| `DBC_INITIAL_MC` / `DBC_MIGRATION_MC` | Market cap (in SOL) when a token starts and when its curve is full and it graduates to a DEX pool |
| `DBC_FEE_BPS` | Trading fee, 100 = 1% (Meteora keeps a share of it) |
| `DBC_CREATOR_FEE_PCT` | Share of the fee (after Meteora's cut) that goes to the token's creator instead of you |
| `DBC_FEE_CLAIMER` | The only wallet that can ever claim your fees. Use a hardware wallet or multisig on mainnet |
| `MAX_LAUNCHES_PER_HOUR` | Per wallet, counting unsigned attempts |

The config is permanent once created. Test on devnet first.

## Safety choices already made

- Images are checked by their real bytes (PNG, JPEG, WebP only; never SVG) and served with `nosniff`.
- Links must be `https://`. Text fields are length-limited. Unsigned launches expire after 15 minutes and their files are deleted.
- The server holds no wallet keys. It only signs with the throwaway mint key of the token being created.
- Only on-chain-confirmed launches are listed.

## Not built yet (roadmap)

- Live price, curve progress and a buy/sell box on the token page (use the SDK `state` and `pool.swap` calls; the docs are at docs.meteora.ag).
- Fee dashboard and a connected-wallet "claim fees" page for the fee claimer (the CLI `npm run dbc-fees` works today).
- Reporting and takedown of abusive tokens (names, pictures and links are user content). Plan for impersonation of real projects and illegal content before going public.
- A real database, search by creator, and bot/spam protection such as Cloudflare Turnstile.
- Terms and a risk page. Running a public launchpad can raise securities, consumer-protection and sanctions questions that depend on where you and your users are: talk to a lawyer before launching on mainnet.

## Files

- `server/validate.mjs` pure form and image checks (tested). `server/store.mjs` token list and images on disk (tested). `server/launch.mjs` builds and confirms launches. `server/index.mjs` routes.
- `src/` the React site (wallet adapter, hash routing: `#/`, `#/create`, `#/token/<id>`).
- `scripts/` config creation, fee claiming and wallet helpers, carried over from the parked Pawpad coin scripts in The Trenches.
