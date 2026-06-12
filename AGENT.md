# Autonomous Agent Wallet (Arc)

An AI agent that holds its own USDC and spends it autonomously **under a mandate the
user sets** — the agentic-payments direction Arc is built for (machine-to-machine
payments, pay-per-use APIs, x402). The agent decides *what* to pay for; a
deterministic policy engine decides *whether it's allowed* — and the AI cannot
override that.

## Why this rides on the smart-account foundation

An autonomous agent is naturally an **ERC-4337 smart account**:
- It pays its own gas **in USDC** (Circle Paymaster) — no native token babysitting.
- Spending limits can eventually be enforced **on-chain** via account modules /
  session keys, not just in the app.

So [src/wallet/smartAccount.ts](src/wallet/smartAccount.ts) is the execution layer,
and the same Base-now / Arc-later config applies.

## Safety model: AI proposes, policy disposes

```
  user sets mandate ─→ AgentPolicy (perTx, daily, total, allowlist, expiry)
                              │
   goal ─→ [Claude decision loop] ─→ proposed payment {to, amount}
                              │
                     [policy engine]  ←─ HARD limits, deterministic, audited
                       allowed? ──no──→ rejected (logged), agent retries/stops
                          │yes
                   sendUsdcSponsored() ─→ USDC tx on Base/Arc (gas in USDC)
                          │
                   persist new AgentState (spentToday/total)
```

The critical property: **the model's output is a *request*, never an authorization.**
Every spend passes through [src/agent/policy.ts](src/agent/policy.ts) — a pure,
deterministic, fully unit-tested engine — before any money moves.

## What's built and verified

- **`src/agent/policy.ts`** — the spending-policy engine. Enforces, with hard limits
  the AI cannot bypass:
  - per-transaction limit
  - rolling 24h daily limit (auto-resets after 24h)
  - lifetime total budget
  - recipient allowlist (with deny-by-default option)
  - mandate expiry
  - rejects zero/negative amounts
  - all amounts in integer USDC base units (no float drift)
  - Verified with 17 assertions covering every limit, the daily roll, expiry, and
    deny-by-default.

## What's next

1. **Decision loop** (`src/agent/brain.ts`) — given a user goal + context, Claude
   (latest model, e.g. `claude-sonnet-4-6`) proposes payments. Requires an API key;
   the model NEVER sees the private key and its output is always gated by the policy
   engine. Tool-use shape: the model calls a `propose_payment(to, amount, reason)`
   tool; the app evaluates it against policy and executes or rejects.
2. **Mandate UI** — a screen where the user grants the agent a budget/policy and can
   revoke it. Persist policy + `AgentState` in SQLite.
3. **Execution wiring** — connect approved spends to `sendUsdcSponsored`.
4. **On-chain enforcement (Arc)** — move limits into an account module / session key
   so they hold even if the app is compromised (Circle Modular Wallets supports
   modules). This is the strongest form and the Arc-native end state.
5. **Audit log** — every proposal + decision + tx recorded for the user to review.

## Principles

- The agent is **non-custodial to the user**: it's the user's own smart account under
  a self-imposed, revocable, expiring mandate — not a third party holding funds.
- **Least privilege**: default deny, allowlist recipients, short expiries.
- **Transparency**: every autonomous action is logged and reviewable.
