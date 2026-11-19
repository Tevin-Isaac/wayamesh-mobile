# Release notes 1.2.0-beta.1 (Android versionCode 3, iOS build 3)

Testnet beta. Not independently audited. **Do not use with real money.** Needs a fresh install: it adds native modules, so it
is not delivered as an over-the-air update to 1.1.0.

## What changed in 1.2.0

* **Optional external wallet.** Settings → External wallet (optional): connect MetaMask, Trust Wallet or another wallet app
  (WalletConnect / Reown) and top up this wallet from it. It is not part of the core wallet, loads only on that screen, and the
  app works fully without it. Not yet tried against a real wallet app on a device.
* **Exact balances.** Total balance is wallet plus offline reserve, truncated and never rounded up; an unreadable balance shows
  a dash or a last-known value, never a made-up zero.
* **Recovery phrase on create.** A new wallet must show and confirm its recovery phrase before anything else.
* **Real Online / Offline indicator** on the home bar, driven by the phone's actual network state (including Wi-Fi with no
  internet). The avatar button is gone; the profile lives in Settings.
* **Contacts** stay until you delete them (press and hold, or the conversation menu). After paying someone you scanned or pasted,
  you can save them in one tap.
* **Get free test USDC** card on the home screen (testnet only).
* Home actions are now Send, Receive, Scan, Add.

## Not tested on devices (1.2.0)

External wallet connection with a real wallet app, Bluetooth hand-off and chat between two phones, and the new onboarding on a
physical phone.

# Release notes 1.1.0-beta.1 (Android versionCode 2, iOS build 2)

## What changed in 1.1.0

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
