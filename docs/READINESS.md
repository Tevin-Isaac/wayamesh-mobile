# Wayamesh readiness review (grant and market)

Last reviewed: 2026-11-19. This is a product-manager style scorecard. It says what is real, what is evidenced, and what still blocks a grant submission or a public launch. Update it whenever something changes.

Legend: ✅ done and checked · 🟡 partly done or not checked on real devices · ❌ missing

## 1. Evidence a reviewer can open today

| Claim | Evidence |
|---|---|
| Working settlement contract on Arc Testnet | `MeshPayV2` [`0xd619…7691`](https://explorer.testnet.arc.io/address/0xd619b77bb8389a632800c300969ef152099f7691), **source verified on the explorer**; 50 Foundry tests in [meshpay-arc](https://github.com/Tevin-Isaac/meshpay-arc) |
| Offline-signed payment settled on-chain by a third party | Funded end-to-end run: deposit to reserve, offline voucher signed with the phone's code, `check()` = valid, settled by another wallet, courier fee paid, replay rejected. Settlement tx [`0x25ca1a7f…98c`](https://explorer.testnet.arc.io/tx/0x25ca1a7f55f93a996dc598f50f2b9c8eee34962da0c19cd60d17312f7b70a98c) |
| Web wallet anyone can try | [wayamesh.xyz/app](https://wayamesh.xyz/app) (create wallet, reserve, send, receive, chat, history, mesh, settings) |
| Android app | [v1.1.0-beta.1 APK](https://github.com/Tevin-Isaac/wayamesh-mobile/releases/latest/download/wayamesh-beta.apk) |
| Phone and web interoperate | Cross-compat tests: the phone seals/opens the wallet's chat messages and reproduces its published test vectors |
| Security thinking is documented | [SECURITY.md](../SECURITY.md) (what is protected, what is not, mainnet checklist), [meshpay-arc docs/SECURITY.md](https://github.com/Tevin-Isaac/meshpay-arc/blob/main/docs/SECURITY.md) |
| Honest scope | READMEs list verified vs not verified; the site says testnet beta |

## 2. Scorecard

| Area | Status | Notes |
|---|---|---|
| Core payment flow (reserve, offline voucher, QR hand-off, settle, fee) | ✅ on-chain | Proven with a funded run; web UI path proven by a funded manual test |
| Contract | 🟡 | Verified source and tests, **no independent audit** |
| Web wallet | ✅ | Live, hardened (33 hostile-input checks). Light mode with a toggle is being added |
| Android app | 🟡 | Built and released; **never installed or run on a physical device in this review** |
| Bluetooth hand-off and nearby chat | 🟡 | Native receiver bug found and fixed; covered by simulation only. Needs two Android phones |
| iOS app | ❌ | Configured only; no build, no TestFlight |
| Chat | 🟡 | Protocol, expiry, cross-compat tested; relays are public and not guaranteed; no push notifications |
| M-Pesa on/off-ramp | 🟡 | Mock mode end to end; server tested (28); **not hosted, never called against real Safaricom**; cash-out not exercised |
| Website | ✅ | Live: honest copy, distinct licensed photography, socials, light/dark toggle in the navbar, compact product section with a real QR example, SEO basics (robots, sitemap, share card), accessibility pass |
| Legal pages (privacy, terms) | 🟡 | Live at /privacy and /terms as clearly marked drafts, written from what the product really does; **need legal review** and a jurisdiction before launch |
| Contact | 🟡 | Site shows a personal Gmail address. `hello@wayamesh.xyz` has no mailbox (no MX record). Set up a domain mailbox before launch |
| Demo video | ❌ | None yet. See the script below |
| App store listing | ❌ | APK sideload only; no Play Console or App Store presence |
| Analytics / feedback loop | ❌ | None; no user interviews or pilot yet |
| Real users / pilots | ❌ | 0 |
| Mainnet | ❌ | Arc mainnet not live |
| Independent audit, bug bounty | ❌ | Planned before mainnet |
| API key in APK | ❌ | `EXPO_PUBLIC_ANTHROPIC_API_KEY` is extractable; rotate and proxy before real release |

## 3. Blockers

**Before submitting a grant application (days)**
1. Record the real-device demo (two phones; script below) and host it (YouTube unlisted or the repo release).
2. Install the APK on a real phone and run the whole test checklist; fix what breaks. Do the Bluetooth test on two Android phones.
3. Have the privacy and terms drafts (already live) reviewed by a lawyer, and replace the personal email with a domain mailbox.
4. Rotate the Anthropic key and remove it from the preview build (or proxy it).
5. Fill the grant form from section 5, linking only evidence in section 1.

**Before a public beta (weeks)**
- Host the ramp server (HTTPS) and, if M-Pesa is shown, say plainly it is a testnet demo; get Safaricom go-live approval and legal advice before any real money.
- Google Play internal testing track; Apple TestFlight (needs a developer account).
- Basic analytics that respects privacy, an in-app feedback link, a support inbox.
- 5 to 10 real pilot users and what they say.

**Before mainnet (months)**
- Independent audit of the contract and wallet key handling and chat protocol; bug bounty.
- Choose the mainnet withdrawal delay, redeploy, verify, monitor.
- Licensing and compliance review per market; fiat rails with a licensed partner.
- Passphrase-sealed backups, reproducible web builds.

## 4. Demo script (about 3 minutes)

1. Open wayamesh.xyz, show the one-line promise, click **Open web wallet**.
2. Create a wallet on phone A; copy its address; fund it from the faucet; show the balance.
3. **Offline reserve** → add 5 USDC (show the contract on the explorer).
4. Put phone A in airplane mode. **Send** 1 USDC to phone B's address, *Sign offline*. A QR appears.
5. Phone B scans it, sees **Funded by payer**, accepts.
6. Turn connectivity back on, **Settle**. Show the transaction on the explorer and both balances.
7. Show chat: add a contact card, send a message, pay inside the thread. State that messages disappear after 24 hours.
8. Say honestly what is not done: testnet only, offline payments are provisional until settled, no audit yet.

## 5. Arc Builder form: suggested answers (update before submitting)

| Field | Answer |
|---|---|
| Project name | Wayamesh |
| Category | Payments |
| Stage | Working prototype on Arc Testnet (do not say live or public) |
| Contract addresses | `MeshPayV2 0xd619b77bb8389a632800c300969ef152099f7691` (verified on the explorer; not shared infrastructure) |
| Project links | https://wayamesh.xyz · https://wayamesh.xyz/app · https://github.com/Tevin-Isaac/wayamesh-mobile · https://github.com/Tevin-Isaac/meshpay-arc · https://github.com/Tevin-Isaac/wayamesh |
| One-line description | A self-custody wallet that signs USDC payments with no internet, hands them over by QR (Bluetooth on Android, beta), and settles on Arc when any phone connects. |
| Relation to Arc, USDC, Circle | USDC is both the unit of account and the gas token on Arc, so a payer needs one asset; sub-second finality makes settlement from the first phone that connects feel instant; payments are drawn from a USDC reserve in a verified contract. |
| Circle products | Arc, USDC. Wallets/Paymaster only if the smart-account beta is shown. Do not tick CCTP or Gateway (roadmap). |
| Feedback wanted | How best to design stronger offline receiver guarantees (collateral and fraud proofs), and Paymaster use for offline signing. |
| Mainnet intent | Yes, after an independent audit |
| Present live | Only after the real-device demo is recorded and rehearsed |

## 6. Honest positioning

Say: "Offline-first USDC payments on Arc, working end to end on testnet, with a verified contract, a web wallet, an Android beta, encrypted chat and a hardened protocol shared across phone and web."

Do not say: live on mainnet, guaranteed or final before settlement, double-spend-proof, audited, M-Pesa live, works on iOS, Bluetooth proven, thousands of users.
