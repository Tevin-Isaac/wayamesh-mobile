import { describe, expect, it } from 'vitest'
import { evaluateSpend, initialState, remaining, type AgentPolicy } from '@/agent/policy'

const U = (n: number) => BigInt(Math.round(n * 1e6))
const A = '0x00000000000000000000000000000000000000aa'
const B = '0x00000000000000000000000000000000000000bb'
const NOW = 1_700_000_000
const policy = (over: Partial<AgentPolicy> = {}): AgentPolicy => ({
  perTxLimit: U(5), dailyLimit: U(10), totalBudget: U(15), allowlist: [], expiresAt: 0, requireAllowlist: false, ...over,
})

describe('agent mandate policy engine', () => {
  it('allows within limits and advances state', () => {
    const d = evaluateSpend(policy(), initialState(NOW), { to: A, amount: U(4), now: NOW })
    expect(d.allowed).toBe(true)
    expect(d.nextState.spentToday).toBe(U(4))
    expect(d.nextState.spentTotal).toBe(U(4))
  })
  it('denies over per-tx, zero, daily, and total budget', () => {
    const s = initialState(NOW)
    expect(evaluateSpend(policy(), s, { to: A, amount: U(5.01), now: NOW }).reason).toBe('Exceeds per-transaction limit')
    expect(evaluateSpend(policy(), s, { to: A, amount: 0n, now: NOW }).reason).toBe('Amount must be positive')
    let st = initialState(NOW)
    for (let i = 0; i < 2; i++) st = evaluateSpend(policy(), st, { to: A, amount: U(5), now: NOW }).nextState
    expect(evaluateSpend(policy(), st, { to: A, amount: U(1), now: NOW }).reason).toBe('Exceeds daily limit')
    const next = NOW + 86_400
    st = evaluateSpend(policy(), st, { to: A, amount: U(5), now: next }).nextState // day 2: 5 more -> total 15
    expect(evaluateSpend(policy(), st, { to: A, amount: U(1), now: next }).reason).toBe('Exceeds total budget')
  })
  it('enforces allowlist, deny-by-default and expiry', () => {
    expect(evaluateSpend(policy({ allowlist: [A] }), initialState(NOW), { to: B, amount: U(1), now: NOW }).reason).toBe('Recipient not on allowlist')
    expect(evaluateSpend(policy({ allowlist: [A.toUpperCase().replace('0X', '0x')] }), initialState(NOW), { to: A, amount: U(1), now: NOW }).allowed).toBe(true)
    expect(evaluateSpend(policy({ requireAllowlist: true }), initialState(NOW), { to: A, amount: U(1), now: NOW }).allowed).toBe(false)
    expect(evaluateSpend(policy({ expiresAt: NOW }), initialState(NOW), { to: A, amount: U(1), now: NOW }).reason).toBe('Agent mandate has expired')
  })
  it('does not change state on denial and reports remaining headroom', () => {
    const s = initialState(NOW)
    const d = evaluateSpend(policy(), s, { to: A, amount: U(99), now: NOW })
    expect(d.nextState.spentTotal).toBe(0n)
    const ok = evaluateSpend(policy(), s, { to: A, amount: U(3), now: NOW })
    expect(remaining(policy(), ok.nextState, NOW)).toEqual({ perTx: U(5), today: U(7), total: U(12) })
  })
})
