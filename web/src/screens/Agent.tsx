import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAddress, isAddress } from 'viem'
import { useData, getContact } from '@/lib/store'
import { useSession } from '@/lib/session'
import { useBalances } from '@/lib/onchain'
import {
  CADENCES, addInstruction, cadenceLabel, deleteInstruction, dueInstructions, evaluateAndRecord, grantMandate, remaining, revokeMandate,
  runDueInstructions, setInstructionStatus, toPolicy, getState,
} from '@/lib/agent'
import { formatUsdc, parseUsdc, shortAddr } from '@/lib/money'
import { Button, Card, Eyebrow, Field, ScreenHeader, toast } from '@/components/ui'
import { Icon } from '@/components/Icon'

function Meter({ label, left, cap }: { label: string; left: bigint; cap: bigint }) {
  const pct = cap > 0n ? Number((left * 100n) / cap) : 0
  return (
    <div className="meter">
      <div className="top"><span>{label}</span><span className="mono">{formatUsdc(left)} / {formatUsdc(cap)} USDC left</span></div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

export function Agent() {
  const { address } = useSession()
  const { agent, contacts } = useData()
  const bal = useBalances(address)
  const [perTx, setPerTx] = useState('5')
  const [daily, setDaily] = useState('20')
  const [total, setTotal] = useState('100')
  const [allow, setAllow] = useState('')
  const [days, setDays] = useState('7')
  const [showForm, setShowForm] = useState(false)
  const [payLabel, setPayLabel] = useState('')
  const [payTo, setPayTo] = useState('')
  const [payAmt, setPayAmt] = useState('')
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]['key']>('once')
  const [testTo, setTestTo] = useState('')
  const [testAmt, setTestAmt] = useState('')
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState('')

  const policy = agent.policy ? toPolicy(agent.policy) : null
  const now = Math.floor(Date.now() / 1000)
  const rem = policy ? remaining(policy, getState(), now) : null
  const due = dueInstructions().length

  function grant() {
    setErr('')
    try {
      grantMandate({ perTx, daily, total, allowlist: allow.split(/[\s,]+/).filter(Boolean), days: Number(days) || 0 })
      toast('Mandate granted. The agent may now spend within these limits, even offline.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Check your inputs') }
  }

  function createInstruction() {
    setErr('')
    try {
      if (!isAddress(payTo)) throw new Error('Enter a valid 0x recipient address or pick a contact.')
      const amount = parseUsdc(payAmt)
      if (amount <= 0n) throw new Error('Amount must be positive.')
      if (policy && policy.allowlist.length > 0 && !policy.allowlist.includes(payTo.toLowerCase())) throw new Error('This recipient is not on the mandate allowlist, so the payment would be denied. Add them to the mandate first.')
      const label = payLabel.trim() || getContact(payTo)?.name || 'Standing payment'
      addInstruction({ label, to: getAddress(payTo), amount, intervalSeconds: CADENCES.find((c) => c.key === cadence)!.secs })
      setPayLabel(''); setPayTo(''); setPayAmt(''); setCadence('once'); setShowForm(false)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Invalid') }
  }

  async function runNow() {
    setRunning(true)
    try {
      const res = await runDueInstructions(bal.spendable)
      if (res.length === 0) return toast('No standing payments are due right now.')
      const paid = res.filter((r) => r.outcome === 'paid').length
      toast(paid > 0 ? `${paid} payment${paid === 1 ? '' : 's'} signed. They settle on Arc when a device is online.` : `No payments made: ${res[0].detail}`)
    } finally { setRunning(false) }
  }

  function test() {
    setErr('')
    if (!isAddress(testTo)) return setErr('Enter a valid recipient address')
    try {
      const d = evaluateAndRecord(testTo, parseUsdc(testAmt))
      toast(`${d.allowed ? 'Would be ALLOWED' : 'Would be DENIED'}: ${d.reason}${d.allowed ? ' (no funds moved — this is a guardrail test)' : ''}`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Invalid amount') }
  }

  return (
    <div>
      <ScreenHeader title="Agent wallet" to="/app/settings" />
      <div className="screen">
        <Link to="/app/agent-chat" className="card accent">
          <span className="round-btn" style={{ width: 36, height: 36 }}><Icon name="spark" size={18} /></span>
          <span className="grow"><div style={{ fontWeight: 600 }}>Ask your wallet</div><div className="dim">"Pay Amina 2 USDC every Friday" — it proposes, you approve</div></span>
          <Icon name="right" className="muted" />
        </Link>
        <p className="dim">An agent can only <i>propose</i> payments. A fixed, auditable policy engine (the same code as the phone app) decides whether each one is allowed. No AI runs in this browser.</p>
        {err && <div className="banner err" role="alert"><Icon name="alert" /><span>{err}</span></div>}

        {policy && rem ? (
          <>
            <Card>
              <div className="stack">
                <div className="row"><Eyebrow>Spending envelope</Eyebrow><span className="live-pill" style={{ marginLeft: 'auto' }}><i />{policy.expiresAt ? `to ${new Date(policy.expiresAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'No expiry'}</span></div>
                <Meter label="Today" left={rem.today} cap={policy.dailyLimit} />
                <Meter label="Total budget" left={rem.total} cap={policy.totalBudget} />
                <div className="row dim" style={{ justifyContent: 'space-between' }}>
                  <span>Max {formatUsdc(policy.perTxLimit)} per payment · {policy.allowlist.length ? `${policy.allowlist.length} allowed recipient${policy.allowlist.length === 1 ? '' : 's'}` : 'any recipient'}</span>
                  <button className="link" onClick={() => { if (window.confirm('Revoke mandate? The agent will be unable to spend until you grant a new one. Standing payments stay but will not run.')) revokeMandate() }}>Revoke</button>
                </div>
              </div>
            </Card>

            {due > 0 && (
              <Card accent>
                <div className="row">
                  <Icon name="zap" size={20} />
                  <div className="grow"><div style={{ fontWeight: 600 }}>{due} standing payment{due === 1 ? '' : 's'} due</div><div className="dim">Signs offline · settles when a device is online</div></div>
                  <Button className="inline" loading={running} onClick={runNow} style={{ minHeight: 40, padding: '8px 14px' }}>Run now</Button>
                </div>
              </Card>
            )}

            <div className="row"><Eyebrow>Standing payments</Eyebrow><button className="icon-btn" style={{ marginLeft: 'auto', color: 'var(--accent)' }} onClick={() => setShowForm((s) => !s)} aria-label={showForm ? 'Close form' : 'New standing payment'}><Icon name={showForm ? 'x' : 'plus'} /></button></div>
            {showForm && (
              <form className="card stack" onSubmit={(e) => { e.preventDefault(); createInstruction() }}>
                {contacts.length > 0 && <div className="chips">{contacts.map((c) => <button type="button" key={c.address} className={`chip ${payTo.toLowerCase() === c.address.toLowerCase() ? 'on' : ''}`} onClick={() => { setPayTo(c.address); if (!payLabel) setPayLabel(c.name) }}>{c.name}</button>)}</div>}
                <Field label="Recipient" mono value={payTo} onChange={(e: any) => setPayTo(e.target.value)} placeholder="0x…" spellCheck={false} />
                <Field label="Amount (USDC)" inputMode="decimal" value={payAmt} onChange={(e: any) => setPayAmt(e.target.value)} />
                <Field label="Label (optional)" value={payLabel} onChange={(e: any) => setPayLabel(e.target.value)} placeholder="e.g. Supplier restock" />
                <div className="chips">{CADENCES.map((c) => <button type="button" key={c.key} className={`chip ${cadence === c.key ? 'on' : ''}`} onClick={() => setCadence(c.key)}>{c.label}</button>)}</div>
                <Button type="submit">Create standing payment</Button>
                <p className="dim">First run is due immediately — tap “Run now” to execute, even with no connection.</p>
              </form>
            )}
            {agent.instructions.length === 0 && !showForm ? (
              <p className="dim">No standing payments yet. Tap + to create one — the agent executes it within your envelope, online or off.</p>
            ) : agent.instructions.map((ins) => (
              <div key={ins.id} className="card tight">
                <div className="row">
                  <div className="grow"><div style={{ fontWeight: 600 }}>{ins.label}</div><div className="mono muted" style={{ fontSize: 12 }}>{formatUsdc(BigInt(ins.amount))} USDC · {cadenceLabel(ins.intervalSeconds)} · to {shortAddr(ins.to)}</div><div className="dim" style={{ fontSize: 11 }}>{ins.status === 'done' ? 'Done' : ins.status === 'paused' ? 'Paused' : `Next: ${new Date(ins.nextRun * 1000).toLocaleDateString()}`} · {ins.runs} run{ins.runs === 1 ? '' : 's'}</div></div>
                  {ins.status !== 'done' && <button className="link" onClick={() => setInstructionStatus(ins.id, ins.status === 'active' ? 'paused' : 'active')}>{ins.status === 'active' ? 'Pause' : 'Resume'}</button>}
                  <button className="icon-btn" aria-label="Delete standing payment" onClick={() => deleteInstruction(ins.id)}><Icon name="trash" size={18} /></button>
                </div>
              </div>
            ))}

            <Eyebrow>Guardrail test</Eyebrow>
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); test() }}>
              <Field label="Recipient" mono value={testTo} onChange={(e: any) => setTestTo(e.target.value)} placeholder="0x…" spellCheck={false} />
              <Field label="Amount (USDC)" inputMode="decimal" value={testAmt} onChange={(e: any) => setTestAmt(e.target.value)} />
              <Button type="submit" variant="secondary">Test proposal</Button>
              <p className="dim">Runs a proposal through the policy engine and logs the result. No funds move.</p>
            </form>

            <Eyebrow>Audit log</Eyebrow>
            {agent.audit.length === 0 ? <p className="dim">No proposals yet.</p> : agent.audit.slice(0, 20).map((a) => (
              <div key={a.id} className="card tight">
                <div className="row"><span className={`badge ${a.allowed ? 'settled' : 'failed'}`}>{a.allowed ? 'allowed' : 'denied'}</span><span className="mono grow ellipsis" style={{ fontSize: 12 }}>{formatUsdc(BigInt(a.amount))} USDC → {shortAddr(a.to)}</span><span className="dim" style={{ fontSize: 11 }}>{new Date(a.ts).toLocaleTimeString()}</span></div>
                <div className="dim" style={{ fontSize: 12 }}>{a.kind} · {a.reason}</div>
              </div>
            ))}
          </>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); grant() }}>
            <Eyebrow>Grant a mandate</Eyebrow>
            <p className="subtitle">Set hard limits the agent can never exceed. They apply to standing payments and agent proposals.</p>
            <Field label="Per payment (USDC)" inputMode="decimal" value={perTx} onChange={(e: any) => setPerTx(e.target.value)} />
            <Field label="Daily limit (USDC)" inputMode="decimal" value={daily} onChange={(e: any) => setDaily(e.target.value)} />
            <Field label="Total budget (USDC)" inputMode="decimal" value={total} onChange={(e: any) => setTotal(e.target.value)} />
            <Field label="Allowed recipients (optional)" multiline mono value={allow} onChange={(e: any) => setAllow(e.target.value)} placeholder="0x…, 0x…  (empty = any recipient)" spellCheck={false} />
            <Field label="Valid for (days, 0 = no expiry)" inputMode="numeric" value={days} onChange={(e: any) => setDays(e.target.value)} />
            <Button type="submit">Grant mandate</Button>
          </form>
        )}
      </div>
    </div>
  )
}

export function AgentChat() {
  const suggestions = ['Pay Amina 2 USDC every Friday', 'How much did I spend this week?', 'Limit my agent to 10 USDC a day']
  return (
    <div>
      <ScreenHeader title="Ask your wallet" to="/app/agent" />
      <div className="screen">
        <Card tone="warning">
          <div style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>Needs a backend proxy</div>
          <p className="subtitle">
            “Ask your wallet” uses Claude to turn plain language into payment proposals. A browser must never hold an API key, so this chat is switched off on the web until the Wayamesh backend exposes an authenticated proxy for it.
            Your wallet, mandate and policy engine keep working without it: set limits and standing payments on the Agent wallet screen.
          </p>
        </Card>
        <p className="dim">When enabled, you'll be able to say things like:</p>
        {suggestions.map((s) => <div key={s} className="card tight" style={{ color: 'var(--dim)' }}>{s}</div>)}
        <form className="composer" style={{ padding: 0, position: 'static' }} onSubmit={(e) => e.preventDefault()}>
          <textarea rows={1} placeholder="Ask your wallet…" aria-label="Ask your wallet (unavailable)" disabled />
          <button className="round-btn" disabled aria-label="Send"><Icon name="up" /></button>
        </form>
        <Link to="/app/agent" className="btn secondary">Back to Agent wallet</Link>
      </div>
    </div>
  )
}

export function Unavailable({ title, heading, body, to = '/app/settings' }: { title: string; heading: string; body: string; to?: string }) {
  return (
    <div>
      <ScreenHeader title={title} to={to} />
      <div className="screen">
        <Card tone="warning">
          <div style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>{heading}</div>
          <p className="subtitle">{body}</p>
        </Card>
        <Link to="/app/settings" className="btn secondary">Back to Settings</Link>
      </div>
    </div>
  )
}
