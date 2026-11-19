# Release notes 1.1.0-beta.1 (Android versionCode 2, iOS build 2)

Testnet beta. Not independently audited. **Do not use with real money.**

## What changed

* **Offline payments are MeshPayV2 reserve vouchers** (`mp2:`): EIP-712 signed, backed by an on-chain reserve, any phone can
  settle and keep the 0.01 USDC courier fee. Signature vectors match the web wallet.
* **New chat protocol, compatible with the Wayamesh web wallet.** Wallet-key identity, `mpc1:` contact cards, sealed boxes
  (ephemeral ECDH, HKDF, XChaCha20-Poly1305), EIP-191 signed messages, Nostr kind 1059 events, `mpm1:` offline codes, relays
  nos.lol and relay.primal.net. A message from the phone opens on the web wallet and the other way round (proved by a test that
  imports the web wallet's own crypto module).
* **Chat unlocks once per session** with biometrics; the key stays in memory only and is wiped when the app goes to the background.
* **24-hour disappearing messages**, plus message requests, block, clear conversation, safety numbers, payment requests and invoices.
* **Hardening from the security review:** only payments to me count as mine, amounts come from the verified voucher, canonical
  signatures only, unsafe recipients refused, storage caps, hostile-input tests, error boundaries, bounded relay handling.
* **Limits:** per-payment and daily spending limits, a user-set accept limit, raising any of them needs biometrics.
* **Review-before-sign** screen with a look-alike address warning.
* **Autopilot:** per-schedule end date and total cap.
* **Bluetooth hand-off fix** (raw JSON frames, smaller chunks, API-aware permissions) on Android.
* **M-Pesa** add money and cash out; cash out from the reserve is built but waits for server support.
* **iOS** project settings and an EAS iOS profile (see `docs/IOS.md`).

## Dropped on upgrade

Old chat conversations and the old derived chat key. Contacts keep their name, address and phone label but must re-share an
`mpc1:` card before chatting again. Payments and settlement history are kept.

## Not tested on devices

Bluetooth (Android peripheral and central), the camera scanner, biometric prompts and key retrieval, the real relays from a
phone network, M-Pesa end to end, all of iOS, and settlement of a voucher signed by the phone against the live contract.
Automated checks run: TypeScript, unit tests (protocol vectors, cross-compatibility, 40 hostile-input checks) and the JS bundles
for Android and iOS.
