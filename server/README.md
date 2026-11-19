# WayaMesh ramp server (M-Pesa on-ramp and off-ramp)

M-Pesa STK Push in (KES to USDC) and B2C out (USDC to KES) for the WayaMesh web wallet and the Android app, on Arc Testnet.

**This is a testnet demo.** USDC on Arc Testnet has no value, the rate is a fixed demo rate (`USD_KES_RATE`), and by default the server runs in **mock mode**: Safaricom is simulated and no money moves. Real Safaricom is used only if the owner explicitly configures Daraja credentials.

It is the same backend as `wayamesh-mobile/server`, plus `verifyVoucherDeposit`: a cash out can be paid from the user's MeshPay reserve (a voucher to the treasury, settled on chain), not just from USDC held on the device.

## Run in mock mode

```bash
cd ramp-server
npm install
cp .env.example .env     # leave the Daraja values empty
npm run dev              # http://localhost:8787
npm test                 # 28 tests
npm run e2e              # in a second terminal: full on-ramp against the running server
```

Mock mode simulates the STK approval after about 5 seconds and the B2C result after about 3 seconds. Every order carries `mock: true`. Without `TREASURY_PRIVATE_KEY`, on-ramp payouts return a made-up transaction hash (nothing is sent) and cash out is unavailable (`treasury: null` in `/api/ramp/config`). With a treasury key, USDC payouts are real Arc Testnet transfers.

The web wallet reaches it through the Vite proxy (`/ramp-api` to `:8787`) in `npm run dev` and `vite preview`, or through `VITE_RAMP_API_URL` for a deployed build.

## Endpoints

* `GET  /api/ramp/config`
* `POST /api/ramp/onramp/mpesa` `{address, phone, amountKes, issuedAt, signature}`
* `POST /api/ramp/offramp/mpesa` `{address, phone, usdc, txHash, deposit?: "native" | "voucher", issuedAt, signature}`
* `GET  /api/ramp/orders/:id`
* `POST /api/ramp/mpesa/callback`, `/mpesa/b2c/result`, `/mpesa/b2c/timeout`: Safaricom webhooks. **Always** need `?token=CALLBACK_SECRET`.

Every user POST is signed (EIP-191) over the message built by `src/authMessage.ts`, valid for 5 minutes, single use.

### Cash out, two ways

1. `deposit: "native"` (default): the user sent native USDC (18 dp on Arc) to the treasury. The server checks the transaction (to, from, value, success, mined).
2. `deposit: "voucher"`: the user paid the treasury from their MeshPay reserve and the settlement transaction was mined. The server checks the receipt for a `Settled` event from the MeshPay contract with `from` = the user, `to` = the treasury and `amount` = the requested USDC (6 dp).

Either way a transaction hash can be used once, and the payout starts only after verification.

## Configuration

See `.env.example`. Notable: `MPESA_TX_TYPE` (`paybill` default, or `till`), `MAX_KES` (cap per request), `CALLBACK_SECRET`, `ALLOWED_ORIGINS`.

In `sandbox` or `production` mode the server **refuses to start** if `CALLBACK_SECRET` is shorter than 24 characters or the default, `DARAJA_CALLBACK_BASE_URL` is not https, `ALLOWED_ORIGINS` is `*`, or the B2C initiator settings are missing.

## What is verified (and what is not)

Verified by running it:

* 28 unit tests (`npm test`): auth and replay, pricing, idempotent payout, direct deposit verification (ok, wrong to, wrong from, wrong value, reverted, unconfirmed, missing), voucher deposit verification (ok, wrong payer, wrong recipient, wrong amount, wrong contract, failed tx, not mined, feature off, reused hash through the service), `MPESA_TX_TYPE` for both values and the B2C URL (with a stubbed `fetch`), unsafe-config refusal, `MAX_KES`, webhook token, log redaction.
* A mock-mode on-ramp end to end against the running server with a throwaway wallet (`npm run e2e`), and through the web UI in headless Chrome.

**Not verified:** any real Safaricom call (sandbox or production), the real STK callback shape from Safaricom, B2C payouts, cash out against the live chain (the deposit checks are tested against stubbed chain data, not a real Arc transaction), and treasury payouts with a real key.

## Go-live checklist (honest)

Nothing here makes this production-ready.

1. **Safaricom approval.** Create a Daraja app, then request go-live for production credentials and whitelisted callback URLs. The sandbox shortcode is `174379` with the public sandbox passkey.
2. **Paybill or Till.** A real shortcode for Lipa na M-Pesa Online. Set `MPESA_TX_TYPE=paybill` or `till` to match it.
3. **B2C.** A B2C-enabled shortcode with float, an initiator user, and `SECURITY_CREDENTIAL` = the initiator password RSA-encrypted with **Safaricom's certificate** (sandbox and production certificates differ), base64.
4. **Public HTTPS callback.** Safaricom must reach `DARAJA_CALLBACK_BASE_URL`. Set a random `CALLBACK_SECRET`. Safaricom does not sign webhooks, so also allow-list Safaricom's IPs at your proxy.
5. **Money and law.** Selling and buying crypto for KES is regulated (Kenya's VASP Act 2025, CBK, CMA, Safaricom terms). This code does not make you compliant and the operator is not a licensed VASP. Get legal advice first.
6. **Mainnet.** Arc mainnet is not live. Real money needs a mainnet treasury, real liquidity, key custody in an HSM or KMS (not an env var), and a real FX source.
7. **Engineering.** Replace the JSON store with a database, add monitoring and reconciliation against Safaricom statements, and per-user and daily volume limits.

B2C timeouts are marked failed for manual review and never auto-refunded, because Safaricom may still pay. A failed B2C start refunds the USDC.

## Notes on running the tests

`vitest.config.ts` is deliberate. Without it vitest walks up to the web app's `../vite.config.ts`, whose Node polyfill plugin replaces `node:crypto` and `node:fs` with browser shims, and every server test fails with errors like `randomUUID is not a function`.
