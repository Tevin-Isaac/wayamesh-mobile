# Wayamesh USSD Service

Custodial USDC wallet for **feature phones** — no smartphone, no app, no data plan
required. Users dial a USSD code (e.g. `*384*XXX#`) and hold/send US dollars (USDC).

This is a standalone backend, isolated from the Expo mobile app (its own
`package.json` and `node_modules`; nothing here is bundled into the app).

## Why custodial + omnibus ledger

A feature phone can't store a key or sign a transaction, so a USSD wallet must be
custodial. We use the model every mobile-money system uses:

- The service holds pooled USDC in a **treasury** wallet on Base.
- Each phone number has an **internal ledger balance**.
- **Phone → phone transfers are instant and gas-free** (ledger debit/credit in one
  SQL transaction). This is the core value for feature-phone users.
- The blockchain is only touched at the **edges**: deposits in, withdrawals out.

## Run locally

```bash
cp .env.example .env          # then set MASTER_SECRET (openssl rand -hex 32)
npm install
npm run simulate              # end-to-end flow, no aggregator/RPC needed
npm run dev                   # start the HTTP server on :3000
```

Test the webhook like an aggregator would:

```bash
curl -s -X POST localhost:3000/ussd \
  -d sessionId=abc -d phoneNumber=+254700000001 -d text=''
```

Defaults to **Base Sepolia testnet**. Set `NETWORK=base-mainnet` only after a full
audit and small-amount live tests.

## USSD menu

```
New user:  1 Create account → PIN → confirm
Existing:  1 Send money    → recipient phone → amount → PIN
           2 Balance       → PIN
           3 My deposit address
           4 Withdraw to wallet → address → amount → PIN
```

## Architecture

| File | Role |
|------|------|
| `index.ts`  | Express server, `/ussd` webhook (Africa's Talking format) |
| `ussd.ts`   | Session state machine (menu logic) |
| `ledger.ts` | Atomic internal transfers, deposits, withdrawals, PIN lockout |
| `wallet.ts` | Custodial key creation, on-chain USDC balance + treasury payout |
| `crypto.ts` | AES-256-GCM key encryption at rest, scrypt PIN hashing |
| `db.ts`     | SQLite store (users, append-only ledger) |
| `config.ts` | Network (Base) + runtime config |

## What's built vs. what's next

**Built & tested (via `npm run simulate`):** registration, PIN auth + lockout,
instant gas-free P2P transfers, atomic overspend protection, balance, deposit
address, on-chain payout primitive.

**Before production:**
- **Deposit watcher** — poll/subscribe to USDC `Transfer` logs to each user's
  deposit address and call `creditDeposit()` after N confirmations.
- **Payout worker** — process queued withdrawals via `treasurySendUsdc()` + SMS
  receipt; debit the ledger on confirmation.
- **Aggregator** — register the `/ussd` URL with Africa's Talking (or a direct MNO
  integration) and acquire a USSD short code per country.
- **Custody hardening** — move `MASTER_SECRET` to a KMS/HSM, or adopt MPC custody
  (Fireblocks / Circle Wallets). Never keep production keys in env.
- **Compliance** — custodying funds triggers KYC and money-transmitter / e-money
  licensing per country. This is a legal prerequisite, not optional.
- **Datastore** — move SQLite → managed Postgres; keep transfers in SQL transactions.
- **On/off-ramp** — connect a provider (e.g. M-Pesa) so users can fund and cash out.

## Security notes

- Private keys are AES-256-GCM encrypted at rest; PINs are scrypt-hashed, never stored.
- PIN lockout: 4 wrong attempts → 15-minute lock (configurable).
- Ledger writes are atomic SQL transactions — a crash can't create or lose funds.
- Money is handled in integer base units (6dp), never floats.
