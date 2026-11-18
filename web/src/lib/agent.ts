/**
 * Agent wallet on the web: a spending mandate enforced by the pure policy engine (src/agent/policy.ts, a verbatim
 * port of the phone app's), an audit log, and standing payments. The engine is the only thing that decides; the
 * UI (and, later, an AI) can only propose. No AI runs in the browser.
 */
import type { Address } from 'viem'
import { evaluateSpend, initialState, remaining, type AgentPolicy, type AgentState, type SpendDecision } from '../agent/policy'
import { parseUsdc } from './money'
import { createSignedPayment } from './pay'
import { getData, setAgent, type AuditEntry, type Instruction, type StoredPolicy } from './store'

export { remaining }

export const CADENCES = [
  { key: 'once', label: 'Once', secs: 0 },
  { key: 'daily', label: 'Daily', secs: 86_400 },
  { key: 'weekly', label: 'Weekly', secs: 604_800 },
  { key: 'monthly', label: 'Monthly', secs: 2_592_000 },
] as const

export const cadenceLabel = (secs: number) => CADENCES.find((c) => c.secs === secs)?.label ?? `Every ${Math.round(secs / 86_400)}d`

const nowSec = () => Math.floor(Date.now() / 1000)

export function toPolicy(p: StoredPolicy): AgentPolicy {
  return {
    perTxLimit: BigInt(p.perTxLimit),
    dailyLimit: BigInt(p.dailyLimit),
    totalBudget: BigInt(p.totalBudget),
    allowlist: p.allowlist,
    expiresAt: p.expiresAt,
    requireAllowlist: p.requireAllowlist,
  }
}

export function getState(): AgentState {
  const s = getData().agent.state
  return s
    ? { spentToday: BigInt(s.spentToday), spentTotal: BigInt(s.spentTotal), dayAnchor: s.dayAnchor }
    : initialState(nowSec())
}

function saveState(s: AgentState) {
  setAgent({ state: { spentToday: s.spentToday.toString(), spentTotal: s.spentTotal.toString(), dayAnchor: s.dayAnchor } })
}

export function grantMandate(input: {
  perTx: string
  daily: string
  total: string
  allowlist: string[]
  days: number
}): void {
  const perTxLimit = parseUsdc(input.perTx)
  const dailyLimit = parseUsdc(input.daily)
  const totalBudget = parseUsdc(input.total)
  if (perTxLimit <= 0n || dailyLimit <= 0n || totalBudget <= 0n) throw new Error('Limits must be above zero.')
  const allowlist = input.allowlist.map((a) => a.trim().toLowerCase()).filter(Boolean)
  for (const a of allowlist) if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error(`Invalid address: ${a}`)
  setAgent({
    policy: {
      perTxLimit: perTxLimit.toString(),
      dailyLimit: dailyLimit.toString(),
      totalBudget: totalBudget.toString(),
      allowlist,
      expiresAt: input.days > 0 ? nowSec() + input.days * 86_400 : 0,
      requireAllowlist: allowlist.length > 0,
    },
    state: { spentToday: '0', spentTotal: '0', dayAnchor: nowSec() },
  })
}

export function revokeMandate() {
  setAgent({ policy: null })
}

function log(entry: Omit<AuditEntry, 'id' | 'ts'>) {
  const a: AuditEntry = { id: crypto.randomUUID(), ts: Date.now(), ...entry }
  setAgent({ audit: [a, ...getData().agent.audit].slice(0, 100) })
}

/** Runs a proposal through the engine and records it. Spent amounts are only committed when `commit` is true. */
export function evaluateAndRecord(to: string, amount: bigint, kind: AuditEntry['kind'] = 'proposal', commit = false): SpendDecision {
  const stored = getData().agent.policy
  if (!stored) {
    log({ kind, to, amount: amount.toString(), allowed: false, reason: 'No active mandate' })
    return { allowed: false, reason: 'No active mandate', nextState: getState() }
  }
  const d = evaluateSpend(toPolicy(stored), getState(), { to, amount, now: nowSec() })
  if (d.allowed && commit) saveState(d.nextState)
  else if (!d.allowed) saveState(d.nextState)
  log({ kind, to, amount: amount.toString(), allowed: d.allowed, reason: d.reason })
  return d
}

// ---- standing payments ----

export function addInstruction(i: { label: string; to: Address; amount: bigint; intervalSeconds: number }) {
  const ins: Instruction = {
    id: crypto.randomUUID(),
    label: i.label,
    to: i.to,
    amount: i.amount.toString(),
    intervalSeconds: i.intervalSeconds,
    nextRun: nowSec(),
    status: 'active',
    runs: 0,
  }
  setAgent({ instructions: [ins, ...getData().agent.instructions] })
}

export function setInstructionStatus(id: string, status: Instruction['status']) {
  setAgent({ instructions: getData().agent.instructions.map((i) => (i.id === id ? { ...i, status } : i)) })
}

export function deleteInstruction(id: string) {
  setAgent({ instructions: getData().agent.instructions.filter((i) => i.id !== id) })
}

export function dueInstructions(now = nowSec()): Instruction[] {
  return getData().agent.instructions.filter((i) => i.status === 'active' && i.nextRun <= now)
}

export interface RunResult {
  instruction: Instruction
  outcome: 'paid' | 'denied' | 'error'
  detail: string
}

/** Signs every due standing payment, but only those the mandate allows. Settles later like any offline payment. */
export async function runDueInstructions(spendable: bigint | null): Promise<RunResult[]> {
  const results: RunResult[] = []
  let left = spendable
  for (const ins of dueInstructions()) {
    const amount = BigInt(ins.amount)
    const d = evaluateAndRecord(ins.to, amount, 'execution', true)
    if (!d.allowed) {
      results.push({ instruction: ins, outcome: 'denied', detail: d.reason })
      continue
    }
    try {
      await createSignedPayment(ins.to, amount, { spendable: left })
      if (left !== null) left -= amount
      const once = ins.intervalSeconds === 0
      setAgent({
        instructions: getData().agent.instructions.map((x) =>
          x.id === ins.id
            ? { ...x, runs: x.runs + 1, status: once ? 'done' : x.status, nextRun: once ? x.nextRun : nowSec() + x.intervalSeconds }
            : x,
        ),
      })
      results.push({ instruction: ins, outcome: 'paid', detail: 'Signed' })
    } catch (e) {
      // the engine already counted this spend; give it back since nothing was signed
      const s = getState()
      saveState({ ...s, spentToday: s.spentToday - amount, spentTotal: s.spentTotal - amount })
      results.push({ instruction: ins, outcome: 'error', detail: e instanceof Error ? e.message : 'Could not sign' })
    }
  }
  return results
}
