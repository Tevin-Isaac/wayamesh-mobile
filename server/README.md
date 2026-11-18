# Wayamesh ramp server

M-Pesa on-ramp (STK Push -> USDC) and off-ramp (USDC -> B2C payout) for Wayamesh on Arc Testnet.
On testnet this is a **sandbox**: testnet USDC at a fixed demo FX rate (`USD_KES_RATE`).

## Run in mock mode (no Safaricom keys)

```
cd server && npm i
cp .env.example .env      # leave Daraja vars empty -> MPESA_MODE=mock
npm run dev               # http://localhost:8787
npm test
```

Mock mode simulates STK approval after ~5s and B2C success after ~3s; every response/order carries `mock: true`.
Without `TREASURY_PRIVATE_KEY`, on-ramp payouts return a *simulated* tx hash (nothing is sent on-chain) and
off-ramp is unavailable (`treasury: null` in `/config`). With a treasury key, USDC payouts are real Arc testnet transfers.

Point the app at it: `EXPO_PUBLIC_RAMP_API_URL=http://<your-lan-ip>:8787`.

## Endpoints

- `GET  /api/ramp/config`
- `POST /api/ramp/onramp/mpesa` `{address, phone, amountKes, issuedAt, signature}`
- `POST /api/ramp/offramp/mpesa` `{address, phone, usdc, txHash, issuedAt, signature}`
- `GET  /api/ramp/orders/:id`
- `POST /api/ramp/mpesa/callback`, `/mpesa/b2c/result`, `/mpesa/b2c/timeout` (Safaricom webhooks, protected by `?token=CALLBACK_SECRET`)

Every user POST is signed (EIP-191) over the message built by `src/authMessage.ts`, valid for 5 minutes, single use.
Off-ramp: the user first sends native USDC (18 dp) to the treasury; the server verifies the receipt
(to, from, value, success, mined) and that the tx hash was never used before paying out.

## Daraja sandbox credentials

1. Create an account at https://developer.safaricom.co.ke, create an app with "Lipa na M-Pesa Sandbox" and "B2C" enabled.
2. Copy Consumer Key/Secret. Sandbox STK shortcode is `174379` with the public sandbox passkey shown on the "Test credentials" page.
3. For B2C, use the sandbox initiator (`testapi`) and its password encrypted with the sandbox cert (see go-live below) as `SECURITY_CREDENTIAL`.
4. Set `MPESA_MODE=sandbox` and fill the vars in `.env`.

## Expose callbacks

Safaricom must reach `DARAJA_CALLBACK_BASE_URL` over public HTTPS:

```
ngrok http 8787          # or: cloudflared tunnel --url http://localhost:8787
```
Put the https URL in `DARAJA_CALLBACK_BASE_URL` and set a random `CALLBACK_SECRET`.

## Fund the treasury

Generate a throwaway key, set `TREASURY_PRIVATE_KEY`, start the server (it logs the address), and request testnet USDC
at https://faucet.circle.com (Arc Testnet). The same wallet receives off-ramp deposits.

## Going live: honest checklist

- Safaricom Daraja **go-live** approval (production app, production credentials, whitelisted callback URLs).
- A real **Paybill or Till** (Lipa na M-Pesa Online) for STK, and a B2C-enabled shortcode with float.
- B2C **initiator** user + `SECURITY_CREDENTIAL` = initiator password RSA-encrypted with Safaricom's production certificate, base64.
- **KYC / AML / legal**: selling and buying crypto for KES is regulated (Kenya's VASP Act 2025, CBK/CMA, Safaricom terms). **We are not a licensed VASP**; this code does not make you compliant. Get legal advice before taking real money.
- **Mainnet USDC**: Arc mainnet is not live; real money needs a mainnet treasury with USDC liquidity and proper key custody (HSM/KMS, not an env var), plus a real FX source instead of a fixed rate.
- Hardening: replace the JSON store with a real DB, add monitoring/alerting, reconcile Safaricom statements, and limit per-user/day volume.
- Webhooks are not signed by Safaricom; rely on the secret token plus IP allow-listing at your proxy.
- B2C timeouts are marked failed for manual review (never auto-refunded, as Safaricom may still pay).
