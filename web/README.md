# Wayamesh web

The Wayamesh website and web wallet: a marketing page at `/` and a real wallet at `/app` that follows the phone app's screens and flow (Vite + React 18 + TypeScript + viem).

- Wallet identity: 12-word seed (or import 12/24 words / private key), derived at `m/44'/60'/0'/0/0`, same as the phone app. Encrypted with your PIN (PBKDF2-SHA256 600k + AES-GCM) in localStorage; never stored in plaintext.
- Payments: MeshPayV2 reserve + EIP-712 vouchers in the `mp2:` 178-byte wire format; QR/share handoff, scan + verify + settle (single and batch), cancel, 24h withdraw. Plain online USDC send too. Gas on Arc is paid in USDC.
- Ramp: M-Pesa add money / cash out against the backend in `server/` (needs `VITE_RAMP_API_URL`).
- Not in the browser: Bluetooth, guardian shards, smart account, "Ask your wallet" (needs a backend proxy; no API key ever ships to the browser).

## Run

```bash
cd web
npm install
cp .env.example .env     # optional
npm run dev              # http://localhost:5173
npm run build            # tsc --noEmit && vite build -> dist/
npm run preview
npm test                 # vitest
npm run check:contract   # read-only live check against MeshPayV2 on Arc Testnet
```

## Environment (public values only; everything `VITE_*` is shipped to the browser)

| Variable | Default | Meaning |
|---|---|---|
| `VITE_MESHPAY_ADDRESS` | `0xd619b77bb8389a632800c300969ef152099f7691` | MeshPayV2 on Arc Testnet (chain 5042002). Changing it changes the EIP-712 domain. |
| `VITE_RAMP_API_URL` | unset | Base URL of the ramp backend. Unset shows "Ramp server not configured". The backend must allow CORS from the site origin. |

## Deploy to Netlify

`netlify.toml` sets build command, `dist` publish dir and the SPA redirect (`/* -> /index.html`). Connect the repo, set the base directory to `web`, add the env vars above in Site settings, deploy. The camera (QR scan) needs HTTPS, which Netlify provides.

## Notes

- `public/sw.js` caches the app shell (network first) so the wallet opens offline; RPC and ramp calls are never cached.
- A PIN is a convenience lock: someone who copies the encrypted blob can brute-force a 6-digit PIN offline. Back up the seed phrase.
- Testnet only.
