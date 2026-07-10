# Wayamesh

**Offline-first P2P USDC payments on [Arc](https://arc.network).** Sign a payment with no internet, hand it to the receiver by **QR code or Bluetooth**, and it settles on Arc in under a second from whichever phone finds a connection first. Money that moves like cash, settles like a blockchain.

Built for the **Build on Arc** hackathon.

## 📲 Try the beta (Android)

| | |
|---|---|
| **Download APK** | [wayamesh-beta.apk — always the latest build](https://github.com/Tevin-Isaac/wayamesh-mobile/releases/latest/download/wayamesh-beta.apk) |
| **All releases** | [Release notes & previous versions](https://github.com/Tevin-Isaac/wayamesh-mobile/releases) |

> Current: **v1.0.0-beta.2 — Offline Handoff**. Runs on **Arc Testnet** — get free test USDC at [faucet.circle.com](https://faucet.circle.com) (select Arc Testnet). iOS TestFlight coming soon.

**Quick test flow:** create a wallet → grab faucet USDC → send to a friend → open chat and pay in-thread → sign a payment in airplane mode and hand it over via QR.

## Why

Over half of Sub-Saharan Africa is unbanked, and connectivity is intermittent. Mobile money proved demand; Wayamesh removes the two remaining walls — **connectivity** and **currency volatility** — with offline-signed USDC transfers that settle in under a second on Arc.

## How an offline payment moves

1. **Sign** — the sender's phone signs a USDC transfer with its hardware-bound key. No connection needed. The signed transaction is sealed: amount, recipient, and sender cannot be altered by anyone.
2. **Hand off** — the payment travels to the receiver's phone as a **QR code** (camera scan) or over **Bluetooth** (native BLE handoff, no infrastructure). The receiver now *holds* the settlement-ready transaction — they no longer depend on the sender reconnecting.
3. **Settle** — whichever phone touches the internet first broadcasts it. Arc finality ≈ 480 ms. Once settled it is irreversible — no chargebacks, no cancellation.

Any phone can also act as a **courier**: carry a third party's payment to the internet and settle it for them. That's the seed of the mesh.

## Features

- **Self-custody wallet** — keys generated on-device, stored hardware-bound (Android Keystore / iOS Secure Enclave), biometric-gated. Never leaves the phone.
- **Offline send + handoff** — sign with no connection; settle-on-reconnect from either side of the trade (QR or BLE handoff), with automatic dedup when multiple phones hold the same payment.
- **Chat + pay** — message contacts and send USDC inside the thread; incoming payments appear as bubbles automatically.
- **Incoming payment detection** — background sync spots transfers to your address (ERC-20 logs + balance-delta for logless native sends).
- **Agent wallet (beta)** — a spending envelope the AI/automation can never exceed: per-tx / daily / total caps, allowlists, expiry — enforced on-device by a deterministic policy engine with a full audit log. **Standing payments execute fully offline**: due payments pass the mandate gate, sign locally, and settle at reconnect.
- **Gasless smart account (beta)** — Circle Smart Account + Circle Paymaster: pay gas in USDC itself.
- **Recovery, three ways** — seed phrase, PIN-protected cloud backup, and Shamir guardian shards.
- **Add money / cash out** — provider-hosted on/off-ramp module (env-gated; faucet fallback on testnet).
- **USSD companion** (prototype in [`ussd-service/`](ussd-service/)) — feature-phone access via `*XXX#` menus.

## Built on Arc

| | |
|---|---|
| Network | Arc Testnet — chain ID `5042002` |
| RPC | `https://rpc.testnet.arc.network` (+ automatic failover) |
| Gas | **USDC is the native gas token** (18 dp native / 6 dp display) |
| USDC ERC-20 facade | `0x3600000000000000000000000000000000000000` |
| Circle Paymaster (v0.7) | `0x31BE08D380A21fc740883c0BC434FcFc88740b58` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |

**Arc surface used today:** JSON-RPC (transfers, logs, receipts), native-USDC gas, 20 gwei fee floor (signed at 40 gwei for offline safety), Circle Paymaster + ERC-4337 smart accounts, Circle faucet.
**On the roadmap:** CCTP / Bridge Kit (top up Arc from other chains), Circle Gateway (unified cross-chain USDC balance), escrow contract for provable offline-spend guarantees (+ watchtower service).

## Stack

Expo (React Native, SDK 54) · TypeScript · ethers v6 · viem + Circle Modular Wallets (smart accounts) · SQLite · expo-secure-store + local authentication · react-native-ble-plx (central) + custom native Kotlin BLE peripheral module

No backend. The phone talks directly to Arc — there is no server between users and their money.

## Run it locally

```bash
npm install
npx expo start          # dev server — full app needs a dev build; Expo Go works for everything except Bluetooth
```

```bash
# Android build via EAS
npx eas-cli build --platform android --profile preview
```

No environment variables are required for testnet. Optional:

- `EXPO_PUBLIC_RAMP_PROVIDER` / `EXPO_PUBLIC_RAMP_API_KEY` — enable the on/off-ramp module (mainnet only)

## Project structure

```
app/                 expo-router screens (wallet, send, chat, mesh, agent, handoff…)
src/wallet/          keystore, signing, sync, settlement, smart account
src/mesh/            payment envelopes, ingest, BLE central + peripheral transports
src/agent/           spending-mandate policy engine, standing payments, offline executor
src/db/              SQLite (transactions, contacts, chat)
modules/wayamesh-ble/  native Kotlin BLE peripheral (advertise + GATT server)
docs/                landing page + pitch deck (GitHub Pages)
ussd-service/        standalone USSD backend prototype
```

## Docs

- [Smart accounts & gasless USDC](SMART_ACCOUNTS.md)
- [Agent wallet & mandates](AGENT.md)
- [USSD service](ussd-service/README.md)

## Known limitations (beta)

- **Chat text is device-local** — payments transmit between devices (on-chain + handoff); text messages don't leave your phone until the mesh relay carries them (next milestone).
- **BLE handoff is single-hop and Android-only** for now (iOS peripheral + multi-hop relay are roadmap); QR handoff works on any two devices today.
- **Offline receiver guarantee is settlement-based** — until a payment settles, treat it like a promise from a customer; the on-chain escrow envelope (locked collateral + fraud proofs) is the roadmap answer for both-offline guarantees.
- Testnet USDC only (Arc mainnet is not yet live).
- UI is English-first; translations exist but aren't wired into all screens yet.

## License

[MIT](LICENSE)
