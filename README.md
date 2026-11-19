# Wayamesh

**Pay in USDC, even offline.** Wayamesh is a self-custody wallet that signs payments with no internet, hands them over by QR (or Bluetooth on Android), and settles them on [Arc](https://arc.network) when any phone gets a connection.

| | |
|---|---|
| **Website** | [wayamesh.xyz](https://wayamesh.xyz) |
| **Web wallet — try it now, nothing to install** | [wayamesh.xyz/app](https://wayamesh.xyz/app) |
| **Android beta (APK)** | [wayamesh-beta.apk — latest](https://github.com/Tevin-Isaac/wayamesh-mobile/releases/latest/download/wayamesh-beta.apk) · [all releases](https://github.com/Tevin-Isaac/wayamesh-mobile/releases) |
| **Website source** | [Tevin-Isaac/wayamesh](https://github.com/Tevin-Isaac/wayamesh) |

> **Testnet only.** Wayamesh runs on **Arc Testnet** with test USDC. Arc mainnet is not live, so nothing here holds real money. Get free test USDC at [faucet.circle.com](https://faucet.circle.com) (choose *Arc Testnet*).

## Try it in two minutes (web or phone — same flow)

The web wallet and the Android app follow the same screens and the same payment format, and the same seed phrase gives the same address on both.

1. **Create a wallet** — open [wayamesh.xyz/app](https://wayamesh.xyz/app) (or the app), choose *Create wallet*, set a PIN, and write down the seed phrase.
2. **Get test USDC** — copy your address from the Wallet screen and request USDC for *Arc Testnet* at [faucet.circle.com](https://faucet.circle.com).
3. **Fund your offline reserve** — *Offline reserve → Add to reserve*. (Two on-chain steps: approve, then deposit. Gas is paid in USDC.)
4. **Send** — *Send*, enter a recipient address and an amount. The button reads *Sign offline voucher*. You can switch on airplane mode first; signing needs no connection.
5. **Hand it over** — a QR code appears. The receiver opens *Scan* and points a camera at it, sees *Funded by payer*, and taps *Accept*. (No camera? *Send as text* / *Copy as text*, and the receiver uses *Paste code*.)
6. **Settle** — whoever has a connection taps *Settle*. The USDC moves on Arc and the settler keeps the small courier fee.

You can test the whole thing with two browser profiles, or a browser and a phone.

## How it works

### The money model

Wayamesh uses the **MeshPayV2** contract on Arc Testnet (`0xd619b77bb8389a632800c300969ef152099f7691`, verified live: 24-hour withdrawal delay).

- **Offline reserve.** You pre-load USDC into the contract under your address. That balance backs your offline payments.
- **Voucher.** An offline payment is an EIP-712 signed authorization: *pay X USDC (+ a courier fee) to address Y, valid until time T, nonce N*. Signing happens on your device and needs no network.
- **Funded check.** Because your reserve is on-chain, anyone you pay can check *Funded by payer* before accepting — whenever they have any connection.
- **Settlement.** Any phone or browser can submit a voucher to the contract. The contract checks the signature, deadline, nonce and reserve, pays the recipient, and pays the courier fee to whoever submitted it. Duplicates are rejected by per-payer nonces.
- **Courier fee.** 0.01 USDC by default (the web wallet lets you change it), paid from your reserve to whoever settles. This is what pays phones to carry and settle other people's payments.
- **Validity.** Vouchers live 24 hours, never longer than the 24-hour withdrawal delay, so a payer cannot sign, hand over, and then drain the reserve before it settles. Receivers refuse vouchers that live longer, or are about to expire.
- **Receiver risk limit.** A receiver holds at most **$100** of unsettled offline value from any one payer.
- **Withdrawing.** *Request withdrawal*, wait the 24-hour delay (your reserve stays spendable meanwhile), then *Finalize*.
- **No reserve?** If your reserve doesn't cover the amount, the phone falls back to a plain signed USDC transfer from your wallet balance, so sending always works.

**What the guarantee is — and isn't.** Until a voucher settles it is a promise backed by the payer's reserve. A malicious payer could sign conflicting vouchers to different receivers; the first to settle wins. That is why receivers cap their exposure per payer. Locked collateral with fraud proofs is on the roadmap. Do not treat an unsettled payment as final money.

### Handing a payment over

The QR code **is** the signed payment (`mp2:` + 178 bytes, base64url). Nothing else is needed.

| Situation | How it travels |
|---|---|
| Same place, both offline | QR scan (any device) or Bluetooth (Android) |
| Sender offline, receiver online | Share/copy the payment as text over any channel; the receiver pastes it into *Scan* |
| Both online | Pay directly; no handoff needed |

### Chat

End-to-end encrypted messaging with contacts, plus payments inside the thread.

- **Contacts.** Save a name, wallet address and an optional phone note (a label only; never used for lookup). You can pay any saved address immediately. To chat, exchange a **contact card** (QR or text). A card carries the address and chat public key; compare the **safety number** with your contact to be sure it is really them. Unknown senders land in a *message requests* inbox until you accept them (or block them).
- **Encryption.** Each message is sealed to the recipient's key (secp256k1 ECDH + XChaCha20-Poly1305) and signed by the sender's wallet key, following the shared spec in [`meshpay-arc/docs/PORTING-TO-WAYAMESH-MOBILE.md`](https://github.com/Tevin-Isaac/meshpay-arc/blob/master/docs/PORTING-TO-WAYAMESH-MOBILE.md). The phone and the web wallet open each other's messages (proven by cross tests and the published test vectors). Because the wallet key is biometric-locked, the app asks for one biometric check per session when you open Chats or pay in a thread, and keeps the key in memory only until the app goes to the background.
- **Transport.** Messages travel through free **public Nostr relays**, which are untrusted mailboxes — they see only sealed bytes under throwaway keys. There is no server of ours, so chat costs nothing to run.
- **24-hour expiry.** Messages disappear after 24 hours: the expiry is signed into the message, set as a relay expiration tag, and enforced by local purges. Contacts and payment history are never purged.
- **Pay in chat.** Paying from a thread sends the payment as a message with an **Accept** button, the same as scanning.
- **Limits.** Text only, 1000 characters. A message to someone offline is delivered when they come online; relays only hold it briefly. The phone receives messages while the app is open (no push notifications yet).
- **Bluetooth chat (Android) is experimental** — see below.

Details: [docs/chat.md](docs/chat.md).

### Bluetooth (Android) — optional

Bluetooth hand-off and nearby chat are **Android-only, single-hop, and optional**. Everything works without Bluetooth (iOS, Expo Go, browsers, Bluetooth off, permission denied): use QR, *Send as text*, or online sends.

- Open the **Mesh** tab: your phone becomes discoverable and can hand queued payments to nearby phones (*Find nearby phones*).
- A small native Kotlin module advertises a GATT service and reassembles chunked frames from a nearby phone.
- **Status:** the frame path was fixed in this release (the receiver rejected every write before) and is covered by a simulation, but **Bluetooth hand-off and Bluetooth chat have not yet been tested on two physical devices**.

### M-Pesa add money / cash out

[`server/`](server/README.md) is a small Daraja backend (STK Push in, B2C out). The app's *Add money / Cash out* screen talks to it via `EXPO_PUBLIC_RAMP_API_URL`; the web wallet via `VITE_RAMP_API_URL`.

- Requests are authorised by a wallet signature (5-minute window, single use), payouts are idempotent, and a failed payout refunds automatically.
- It has a **mock mode** that simulates Safaricom, so the full flow demos with no credentials.
- **Testnet demo only.** On Arc Testnet, USDC has no value, so rates are a fixed demo rate and amounts are capped. Going live needs Arc mainnet, Safaricom approval for the shortcode, B2C initiator credentials, and legal/licensing review.
- Verified: unit tests (17) and a mock-mode end-to-end on-ramp. **Not yet verified:** real Safaricom calls, B2C payouts, or off-ramp against the live chain.

### Agent wallet (phone)

A spending envelope that automation can never exceed: per-transaction, daily and total caps, recipient allowlist and expiry, enforced on-device by a deterministic policy engine with an audit log. Standing payments run offline. An optional "Ask your wallet" chat uses Claude to *propose* payments; the policy engine decides. See [AGENT.md](AGENT.md). *(Note: the demo build reads its API key from an `EXPO_PUBLIC_` variable, which is extractable from the APK — it must move behind a backend before any real release.)* The web wallet has mandates and the policy engine but shows "Ask your wallet" as needing a backend proxy.

### Recovery and security

- Keys are generated on the device. On the phone they are stored in the OS keystore, gated by biometrics.
- On the web, the key is encrypted with your PIN (PBKDF2 600,000 rounds + AES-GCM). **The PIN is a convenience lock** — the seed phrase is the real recovery; keep it safe.
- Recovery on the phone: seed phrase, PIN-protected encrypted backup, or Shamir guardian shards (guardian recovery and the smart account are phone-only).
- 12-word seeds (web) and 24-word seeds (phone) both import on either side; one seed gives one address.

## Phone vs web

| | Android app | Web wallet |
|---|---|---|
| Create / import / restore wallet, PIN, backup | ✅ | ✅ |
| Offline reserve, offline-signed vouchers, QR hand-off, settle | ✅ | ✅ |
| Send as text / paste a payment | ✅ | ✅ |
| Contacts + encrypted chat + pay in chat | ✅ | ✅ |
| M-Pesa add money / cash out (needs `server/`) | ✅ | ✅ |
| Agent mandates | ✅ | ✅ |
| Bluetooth hand-off and mesh | ✅ Android, experimental | ❌ browsers can't |
| Biometric unlock | ✅ | PIN + auto-lock |
| Guardian recovery, gasless smart account | ✅ beta | ❌ |
| "Ask your wallet" (Claude) | ✅ demo | needs backend |
| Install | APK (beta). iOS build configured via EAS, untested on devices ([docs/IOS.md](docs/IOS.md)) | none — [wayamesh.xyz/app](https://wayamesh.xyz/app) |

## Built on Arc

| | |
|---|---|
| Network | Arc Testnet — chain ID `5042002` |
| RPC | `https://rpc.testnet.arc.network` (+ failover) |
| Gas | USDC is the native gas token (18 dp native / 6 dp as ERC-20) |
| USDC ERC-20 facade | `0x3600000000000000000000000000000000000000` |
| MeshPayV2 | `0xd619b77bb8389a632800c300969ef152099f7691` |
| Circle Paymaster (v0.7) | `0x31BE08D380A21fc740883c0BC434FcFc88740b58` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |

## What has and hasn't been verified

**Verified by running it**
- A voucher signed on the web wallet was settled on Arc Testnet and the recipient's balance rose by exactly the amount (first funded end-to-end test).
- Mobile- and web-signed vouchers validate against the live contract (valid signature, wrong signer and expired all return the correct codes), and the mobile codec decodes with the web decoder.
- Phone app: typecheck, 56 tests (chat protocol cross-compatibility with the Arc Studio web wallet, all published test vectors, 33 hostile-input checks plus phone-specific ones), and the Android and iOS JavaScript bundles build. A funded end-to-end run on Arc Testnet: deposit, sign offline with the phone's code, check, settle by a third party, courier fee paid, replay rejected.
- Web wallet: see [meshpay-arc](https://github.com/Tevin-Isaac/meshpay-arc) for its checks.
- Chat: seal/open, tamper and forgery rejection, signed expiry, purge keeping contacts and payments, and a live message round trip through two public relays.
- Ramp server: 17 tests and a mock-mode on-ramp.

**Not yet verified**
- Bluetooth hand-off, Bluetooth chat and mesh detection on real devices.
- The phone's new chat screens, share/paste buttons and reserve screen on a device (typechecked and bundled only).
- Real M-Pesa (Safaricom) calls and cash-out.
- Background message delivery on the phone.

## Run it locally

```bash
# Phone app (full app needs a dev build; Expo Go works for everything except Bluetooth)
npm install
npx expo start
npx tsc --noEmit                       # typecheck

# Android build via EAS
npx eas-cli build --platform android --profile preview

# Web wallet
cd web && npm install && npm run dev   # http://localhost:5173/app
npm test && npm run build

# M-Pesa ramp backend (mock mode needs no credentials)
cd server && npm install && npm run dev
npm test
```

Environment variables (all optional on testnet):
- `EXPO_PUBLIC_RAMP_API_URL` / `VITE_RAMP_API_URL` — URL of the `server/` ramp backend.
- `EXPO_PUBLIC_RAMP_PROVIDER` / `EXPO_PUBLIC_RAMP_API_KEY` — optional hosted card/bank provider (mainnet only).
- See [`server/.env.example`](server/.env.example) for the backend. **Never commit `.env` files.**

## Project structure

```
app/                   expo-router screens (wallet, send, receive, reserve, chat, mesh, agent, ramp…)
src/wallet/            keystore, signing, MeshPayV2 reserve + settlement, sync
src/mesh/              voucher codec, envelopes, ingest, BLE central + peripheral transports
src/chat/              E2E encrypted chat: crypto, relay pool, identity, service
src/agent/             spending-mandate policy engine, standing payments, offline executor
src/ramp/              ramp server client
src/db/                SQLite (transactions, contacts, chat, reserve cache)
modules/wayamesh-ble/  native Kotlin BLE peripheral (advertise + GATT server)
web/                   the web wallet (Vite + React) — built into wayamesh.xyz/app
server/                M-Pesa (Daraja) ramp backend
ussd-service/          standalone USSD backend prototype
docs/                  chat design, pitch deck
```

The website ([Tevin-Isaac/wayamesh](https://github.com/Tevin-Isaac/wayamesh)) is a Next.js site that mounts the built web wallet at `/app`. Update it with `web/scripts/sync-to-website.sh "<path to the website repo>"`.

## Roadmap

Real-device Bluetooth testing and multi-hop relay, iOS peripheral, push notifications, locked-collateral receiver guarantees with fraud proofs, a gasless relayer, Arc mainnet, independent contract audit, and licensed fiat rails.

## Docs

- [Security: what is protected, what is not](SECURITY.md)
- [Feature parity with the web wallet](docs/PARITY.md) · [Release notes](docs/RELEASE-NOTES.md) · [iOS build](docs/IOS.md)
- [Chat design and limits](docs/chat.md)
- [Smart accounts & gasless USDC](SMART_ACCOUNTS.md)
- [Agent wallet & mandates](AGENT.md)
- [Web wallet](web/README.md) · [M-Pesa ramp server](server/README.md) · [USSD service](ussd-service/README.md)

## License

[MIT](LICENSE)
