# Smart Accounts + Circle Paymaster (USDC-only gas)

Goal: users transact in **USDC only** — no native gas token — by moving the wallet
from a raw EOA to an ERC-4337 **smart account** and paying gas via the **Circle
Paymaster**. The device key (in SecureStore) remains the sole owner/signer, so
self-custody is preserved.

This is the chosen launch posture: **Base now, Arc later** — and Circle's Paymaster
is deployed at the **same address on Base and Arc**, so the Arc migration is mostly
a config switch.

## What's built (verified)

- `src/constants/aa.ts` — verified Circle Paymaster v0.7 + USDC + entrypoint config
  for Base Sepolia, Base mainnet, and Arc Testnet (addresses from Circle docs).
- `src/wallet/permit.ts` — EIP-2612 permit signing (Circle's documented flow).
- `src/wallet/smartAccount.ts` — `getSmartAccountAddress`, `getSmartAccountUsdcBalance`,
  `sendUsdcSponsored` using `toCircleSmartAccount` + Circle Paymaster + a bundler.

Verified in isolation against Base Sepolia with real libraries and Circle's real
paymaster address: smart-account derivation from the device owner key (deterministic),
USDC transfer encoding, and paymaster-data encoding all pass. Type-checks clean.

The module is intentionally **not yet imported by any screen**, so the current EOA
app is unaffected until cutover.

## To make it live (3 steps)

### 1. Crypto polyfills (React Native)
viem/@circle need Web Crypto in RN. Add at the very top of `index.js`:

```js
import 'react-native-get-random-values';
```

Install: `npx expo install react-native-get-random-values`. Test wallet creation +
`getSmartAccountAddress()` on a real device/dev build (not Expo Go for native crypto).

### 2. Bundler endpoint
`src/constants/aa.ts` defaults `BUNDLER_URL` to Pimlico's public endpoint
(`https://public.pimlico.io/v2/<chainId>/rpc`) — fine for first tests, rate-limited.
For production set `EXPO_PUBLIC_BUNDLER_URL` to a keyed Pimlico/Alchemy/Circle bundler.

### 3. Cutover the send flow
- On wallet create/import, surface the **smart-account address** (from
  `getSmartAccountAddress`) as the user's receive address — fund THAT, not the EOA.
- In `app/confirm.tsx`, replace the EOA `buildOfflineTransfer`/settle path with
  `sendUsdcSponsored(to, amount)` when on a smart-account network.
- Update balance reads to `getSmartAccountUsdcBalance`.
- First on-chain test: fund the smart account with Base Sepolia USDC from
  faucet.circle.com, send a small amount, confirm gas was paid in USDC (look for the
  `UserOperationSponsored` event).

## Notes & tradeoffs

- **10% gas surcharge in USDC** on Base/Arbitrum (Circle's operational fee). Gas is
  cents, so this is negligible per tx.
- The smart-account address **differs from the old EOA address** — for a pre-launch
  testnet app this is fine; communicate it as the canonical address going forward.
- The first transaction also deploys the account (counterfactual deployment); the
  paymaster can cover that deployment gas in USDC too.
- **Offline mesh interaction:** sponsored UserOps need a bundler (online). The
  offline-sign-then-settle model still applies for the queue; settlement now goes
  through the bundler instead of a raw broadcast.

## Why this also powers the AI agent

An autonomous agent wallet (the chosen AI direction for Arc) is naturally a smart
account: gas in USDC, plus on-chain-enforceable **spending policies / session keys /
allowances** via account modules. This foundation is the substrate for that — see a
future `AGENT.md`.
