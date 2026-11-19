# Wayamesh security

**Status: testnet only. Not ready for real money.** This page says what is protected, what is not, and what must happen before any mainnet launch. It is written to match the code, not to reassure.

The web wallet's detailed review lives in [`meshpay-arc/docs/SECURITY.md`](https://github.com/Tevin-Isaac/meshpay-arc/blob/master/docs/SECURITY.md). An AI-assisted review is **not** an independent audit.

## What protects you today

**Keys**
- Keys are generated on your device. On the phone they live in the OS keystore (Android Keystore / iOS Keychain), gated by biometrics. On the web they are encrypted with your PIN or passphrase (PBKDF2 600,000 rounds + AES-GCM).
- Wayamesh servers never see your keys, seed phrase or PIN.
- Raising spending limits, the accept limit or the agent mandate needs biometric re-authentication on the phone, and the PIN on the web.

**Payments**
- A payment is an EIP-712 signed voucher that settles only from the payer's prepaid reserve in the `MeshPayV2` contract. The signature covers amount, recipient, fee, nonce, deadline and reference, so nobody can change them.
- Receivers refuse vouchers that live longer than the withdrawal delay, are about to expire, use a non-canonical signature, or are addressed to someone else (those are only *carried*, with a warning).
- Recipients that can never be right are refused everywhere: the zero address, the USDC token contract and the settlement contract.
- A receiver holds at most a configurable amount of unsettled offline value per payer (default $100). Caps also limit unsettled payments (150), stored payments (400), messages (2,500), contacts (300) and message requests (40).
- The contract has no owner, admin, pause or upgrade path. Withdrawals are delayed so a payer cannot sign, hand over and drain the reserve before settlement.

**Chat**
- Messages are end-to-end encrypted to the recipient and signed by the sender. Relays see only sealed bytes under throwaway keys.
- Every field of an incoming message is validated before it is stored; a malformed or hostile message cannot crash the app, and amounts shown come from the verified payment, never from the sender's claim.
- Messages expire after 24 hours (signed timestamp, relay expiration tag and local purges). Contact cards show the full address and strip hidden or direction-changing characters.

## What is still true

- **Offline payments are provisional until they settle.** A malicious payer can sign conflicting vouchers to different receivers; the first to settle wins and the other is not compensated on-chain. Accept offline only what you would trust the payer with. This is why receivers cap exposure per payer. Do not treat an unsettled payment as final money.
- **The web PIN is a convenience lock.** Someone who copies the encrypted data from a browser can guess a 6-digit PIN offline. Use a passphrase for anything that matters. The phone's hardware keystore does not have this weakness.
- **The phone's cloud backup is still protected by a 6-digit PIN**, not a 12+ character passphrase. This is a known gap; keep your seed phrase safe instead of relying on it.
- **Chat is metadata-visible to relays** (your network address and the key you receive on), uses public relays that can drop or delay messages, and is not delivered in the background on the phone yet.
- **Bluetooth hand-off and Bluetooth chat are Android-only and have not been tested on real devices.** The native receiver had a bug that rejected every write; it is fixed and covered by a simulation, not by a device test.
- **The demo build's "Ask your wallet" feature reads its Claude API key from an `EXPO_PUBLIC_` variable, which is extractable from the APK.** Use a key you can revoke and move it behind a backend before any real release.
- **M-Pesa add money / cash out is a testnet demo.** The ramp backend authorises requests with a wallet signature, but it has not been exercised against real Safaricom or independently reviewed.
- **The first load of the web wallet runs code from the host.** A compromised host or build could ship a malicious app. Mainnet use needs reproducible builds and a published hash, or native apps only.
- **No independent audit and no bug bounty yet.**

## What was tested

- 33 hostile-input checks for chat and payments, plus phone-specific checks (`npm run test:security`), and cross-compatibility tests that make the phone and the Arc Studio web wallet seal and open each other's messages and reproduce the published test vectors (`npm test`).
- The contract's own unit, fuzz and invariant tests live with its source in `meshpay-arc`.
- A funded end-to-end run on Arc Testnet: deposit to the reserve, sign offline, check, settle by a third party, courier fee paid, replay rejected.

Not covered by tests: anything that needs a physical device (Bluetooth, camera, biometrics, iOS), real relays under load, and real Safaricom.

## Before any mainnet launch

1. An independent audit of `MeshPayV2` and of the wallets' key handling and chat protocol, by a firm that audits wallets.
2. A public bug bounty and a private way to report issues.
3. Choose the mainnet withdrawal delay (7 days is planned) and redeploy; never reuse the testnet contract. Verify the source on the explorer.
4. Reproducible builds, a published hash for the web wallet, and store-signed native apps.
5. Real RPC providers with fallbacks, monitoring and alerting, and relays we operate in addition to public ones.
6. Backups sealed with a passphrase instead of a PIN; the API key moved behind a backend.
7. Spending and balance limits during a limited launch, and a way to pause the front end.
8. Legal review for money transmission and sanctions screening in every country served.

## Reporting a problem

Email the maintainers (see the contact on [wayamesh.xyz](https://wayamesh.xyz)) with details and, if you can, steps to reproduce. Please do not publish a vulnerability before we have had a chance to fix it.
