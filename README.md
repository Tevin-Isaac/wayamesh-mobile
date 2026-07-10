# Wayamesh

**Offline-first P2P USDC payments on [Arc](https://arc.network).** Send digital dollars person-to-person even without internet — transactions are signed offline, relayed peer-to-peer, and settle on Arc the moment anyone in the chain reconnects.

Built for the **Build on Arc** hackathon.

## 📲 Try the beta (Android)

| | |
|---|---|
| **Direct APK** | [Download Wayamesh beta](https://expo.dev/artifacts/eas/KPWBtZ61hRWQGlKtn6q_kxsfBJEhpw4HR97MOIXQFps.apk) |
| **Build page + QR code** | [expo.dev build](https://expo.dev/accounts/tevinprime66/projects/wayamesh-mobile/builds/5f9bac0b-29ad-4c97-b514-6f9d892eb4d0) |

> Runs on **Arc Testnet** — get free test USDC at [faucet.circle.com](https://faucet.circle.com) (select Arc Testnet). iOS TestFlight coming soon.

**Quick test flow:** create a wallet → grab faucet USDC → watch it auto-appear in your activity → send to a friend → chat with them and pay in-thread.

## Why

Over half of Sub-Saharan Africa is unbanked, and connectivity is intermittent. Mobile money proved demand; Wayamesh removes the two remaining walls — **connectivity** and **currency volatility** — with offline-signed USDC transfers that settle in under a second on Arc.

## Features

- **Self-custody wallet** — keys generated on-device, stored hardware-bound (Android Keystore / iOS Secure Enclave), biometric-gated. Never leaves the phone.
- **Offline send** — sign a USDC transfer with no connection; it queues and settles automatically when you're back online (~480 ms finality on Arc).
- **Chat + pay** — message contacts and send USDC inside the thread; incoming payments show up as bubbles automatically.
- **Incoming payment detection** — background sync spots transfers to your address (both ERC-20 and native) and posts them to your activity + chat.
- **Gasless smart account (beta)** — Circle Smart Account + Circle Paymaster: pay gas in USDC itself, no separate gas token.
- **Agent wallet (beta)** — spending mandates (per-tx / daily / total caps, allowlists, expiry) enforced locally, plus **standing payments that execute fully offline**: due payments pass the mandate gate, sign with no connection, and settle on Arc at reconnect.
- **Recovery** — seed phrase, PIN-protected cloud backup, and Shamir guardian shards.
- **Add money / cash out** — provider-hosted on/off-ramp module (env-gated; faucet fallback on testnet).
- **USSD companion** (prototype in [`ussd-service/`](ussd-service/)) — feature-phone access via `*XXX#` menus.

## Built on Arc

| | |
|---|---|
| Network | Arc Testnet — chain ID `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Gas | **USDC is the native gas token** (18 dp native / 6 dp display) |
| USDC ERC-20 facade | `0x3600000000000000000000000000000000000000` |
| Circle Paymaster (v0.7) | `0x31BE08D380A21fc740883c0BC434FcFc88740b58` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |

## Stack

Expo (React Native, SDK 54) · TypeScript · ethers v6 · viem + Circle Modular Wallets (smart accounts) · SQLite · expo-secure-store + local authentication · react-native-ble-plx (mesh transport, in progress)

## Run it locally

```bash
npm install
npx expo start          # dev server (use a dev build, not Expo Go — native modules)
```

```bash
# Android build via EAS
npx eas-cli build --platform android --profile preview
```

No environment variables are required for testnet. Optional:

- `EXPO_PUBLIC_RAMP_PROVIDER` / `EXPO_PUBLIC_RAMP_API_KEY` — enable the on/off-ramp module (mainnet only)

## Project structure

```
app/            expo-router screens (wallet, send, chat, mesh, agent, settings…)
src/wallet/     keystore, signing, sync, smart account
src/agent/      spending-mandate policy engine + audit log
src/db/         SQLite (transactions, contacts, chat)
src/mesh/       BLE transport scaffold
docs/           landing page + pitch deck (GitHub Pages)
ussd-service/   standalone USSD backend prototype
```

## Docs

- [Smart accounts & gasless USDC](SMART_ACCOUNTS.md)
- [Agent wallet & mandates](AGENT.md)
- [USSD service](ussd-service/README.md)

## Known limitations (beta)

- BLE mesh is scan-only today — multi-hop relay transport is in progress; offline txs settle via the sender reconnecting.
- Testnet USDC only (Arc mainnet is not yet live).
- UI is English-first; translations exist but aren't wired into all screens yet.

## License

[MIT](LICENSE)
