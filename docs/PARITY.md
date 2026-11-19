# Feature parity: Arc Studio web wallet vs this phone app

Source of truth for the protocol is the Arc Studio export (`docs/PORTING-TO-WAYAMESH-MOBILE.md`, `docs/SECURITY.md`). This table was
built by reading its `src/lib` and `src/components` (AgentSheet, SecuritySheet/SecurityCards, CardConfirm, ContactSheet, Thread,
ErrorBoundary, LimitsSheet, ReceiveSheet/ScanSheet, SendSheet, Onboarding, PinField, MpesaSheet, shell/ and tabs/).
Note: the PNGs in its `docs/screenshots/` are corrupted in the download (the first byte is damaged), so they could not be viewed;
this inventory comes from the code.

"Done" means implemented and covered by a unit test or a typecheck/bundle. Nothing here has been run on a physical phone.

| Feature | Arc Studio web | Phone before this pass | Action / status |
|---|---|---|---|
| Wallet creation, same derivation (m/44'/60'/0'/0/0) | 12 words, PIN | 24 words, hardware keystore | Keep. Same address for the same phrase (test vector reproduced) |
| Unlock | 6-digit PIN vault, lockout | Biometric / OS keystore | Keep (stronger than a web PIN) |
| Offline payment = EIP-712 voucher `mp2:` | Yes | Yes (already migrated) | Verified against section 8 vectors. Courier fee default 0.01 stays |
| Review before signing | Review sheet, look-alike warning | Signed straight from the keypad | **Done**: review screen (full grouped address, amount, fee, expiry, invoice ref, look-alike warning) |
| Recipient guard (zero / USDC / settlement contract) | Yes | No | **Done** in send, chat pay, add-contact, cash out, autopilot (all go through `sendPayment`) |
| Canonical signatures only | Yes | No | **Done** (`decodeVoucher` rejects v not 27/28 or high s) |
| Payments for me only if `to` is me; never show claimed amount | Yes | Partly | **Done**: chat payment bubble shows the voucher amount; a payment to someone else is stored as "carried" with a warning |
| Accept limit per payer | User setting | Fixed $100 | **Done**: setting in Settings > Limits, default 100, raising needs biometric re-auth |
| Spending limits (per payment, per 24h) | LimitsSheet | None for manual sends (only the agent mandate) | **Done**: defaults 50 / 200, apply to send, chat pay, autopilot and cash outs; raising needs re-auth; bad value falls back to default |
| Caps (150 unsettled, 400 stored, 2500 messages, 300 contacts, 40 requests) | Yes | Partly (messages 1000) | **Done** in `src/utils/safety.ts` CAPS, enforced in ingest and `src/db/chat.ts` |
| Encrypted chat, wire format | `mpc1:`, `mpm1:`, kind 1059 | Different protocol (derived chat key) | **Done**: replaced; cross-tested both directions with Arc's own module |
| Chat identity | Wallet key | Separate derived key stored unprotected | **Done**: wallet key, biometric once per session, memory only, wiped on background/logout; old key deleted |
| 24h disappearing messages | (not in web) | Yes | Kept and extended: NIP-40 tag, receiver drops >24h / >1 day future, purge on start/foreground/5 min/thread open; contacts and payments never purged |
| Message requests inbox, accept / block, clear conversation | Yes | Flag only | **Done**: Requests screen, block hides + drops, clear conversation, cap 40 |
| Safety number, verified marker | Yes | Yes | Kept (new vector) |
| Contact card confirm screen | CardConfirm (full address, cleaned name) | Card shown, name editable | **Done**: full address, name stripped of control/bidi chars, unsafe addresses refused |
| Add contact by address, optional phone label | (no) | Yes | Kept (phone strength) |
| Payment requests / invoices in chat | `request` kind + ref | None | **Done**: Request button, Pay opens Send prefilled with amount+ref (ref is signed into the voucher); invoice marked paid only by a payment to me that covers it |
| Request link `meshpay:addr?amount&ref&note` | Yes | None | **Done**: scanner and paste accept it, also `mpc1:` and `mpm1:` |
| Autopilot (standing payments, daily/weekly/monthly, until, max total, audit log, inside limits) | AgentSheet | Mandate + instructions + audit, no per-schedule end/cap | **Done**: per-schedule end date and total cap added; blocked schedules pause and log; runs through `sendPayment` so manual limits apply; granting a mandate needs re-auth |
| Guardians 2-of-3 (same shard format) | Yes | Yes | Verified by test (Arc payload shape recovers on phone code and vice versa); range checks added |
| Backups | Own 12+ char passphrase, bounded KDF, typed confirm | Encrypted with the 6-digit app PIN | **GAP, not ported**: the phone backup still uses the PIN. Reworking the backup screens is larger than this pass. Treat the cloud backup as weak until it uses a passphrase |
| Error boundary | Per tab | None | **Done**: around the root stack and tabs |
| Security screen | SecuritySheet | None | **Done**: Settings > What is protected, mirrors "What is still true" |
| M-Pesa add money | MpesaSheet | Yes | Kept |
| M-Pesa cash out from reserve by voucher | `deposit: 'voucher'` | Native transfer only | **Done, gated**: shown only if `/api/ramp/config` returns `meshpay`. The server in `server/` does not return it yet, so it is dormant until the lead adds it |
| Funded check on incoming payment | Chip | Yes (receive-payment) | Kept |
| Courier tips / settle for others | Yes | Yes | Kept |
| Bluetooth hand-off | No | Android only, experimental | Kept; iOS shows "Android-only, use QR or text" |
| Smart account (Paymaster), i18n (9 locales), USSD, agent chat | No | Yes | Kept (not touched) |
| WalletConnect / wagmi "Connect wallet" | Web only | No | Deliberately not ported (guide section 7b) |
| Production hooks stripped | Yes | n/a | n/a (no preview hooks in this app) |

## Known gaps (honest)

* Cloud backup uses the app PIN, not a 12+ character passphrase (above).
* The ramp reserve cash out has no server support yet.
* Message carrying over Bluetooth is a scaffold: central-only, Android peripheral untested.
* New screens use English strings only; the 9 locale files were not extended.
* Old chat conversations and old chat keys cannot be migrated and were dropped.
