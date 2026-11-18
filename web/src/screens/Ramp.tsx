import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession, getAccount } from '@/lib/session'
import { useData, upsertOrder } from '@/lib/store'
import {
  RAMP_BASE_URL, TERMINAL, getOrder, getRampConfig, normalizeKenyanPhone, previewOfframp, previewOnramp, rampConfigured,
  startOfframp, startOnramp, type RampConfig, type RampOrder,
} from '@/lib/ramp'
import { useBalances, sendUsdcOnline } from '@/lib/onchain'
import { useOnline } from '@/lib/net'
import { explainTxError } from '@/lib/useSettle'
import { fmt2, parseUsdc } from '@/lib/money'
import { FAUCET_URL, txUrl } from '@/lib/chain'
import { Button, Card, Eyebrow, Field, ScreenHeader } from '@/components/ui'
import { Icon } from '@/components/Icon'

const STEPS_ON = [['pending', 'M-Pesa prompt sent to your phone'], ['paid', 'Payment received'], ['delivering', 'Sending USDC to your wallet'], ['completed', 'USDC delivered']] as const
const STEPS_OFF = [['pending', 'Confirming your USDC transfer'], ['paid', 'USDC received'], ['delivering', 'Sending KES to M-Pesa'], ['completed', 'KES paid out']] as const

function Timeline({ order }: { order: RampOrder }) {
  const steps = order.kind === 'onramp' ? STEPS_ON : STEPS_OFF
  const idx = steps.findIndex(([k]) => k === order.status)
  const failed = order.status === 'failed'
  return (
    <ol className="timeline" style={{ listStyle: 'none' }} aria-label="Order status">
      {steps.map(([k, label], i) => {
        const cls = failed ? (i === 0 ? 'done' : '') : i < idx || order.status === 'completed' ? 'done' : i === idx ? 'now' : ''
        return <li key={k} className={`tl-step ${cls}`}><i />{label}</li>
      })}
      {failed && <li className="tl-step fail"><i />Failed{order.reason ? `: ${order.reason}` : ''}</li>}
    </ol>
  )
}

export function Ramp() {
  const { address } = useSession()
  const online = useOnline()
  const bal = useBalances(address)
  const { orders } = useData()
  const [tab, setTab] = useState<'on' | 'off'>('on')
  const [cfg, setCfg] = useState<RampConfig | null>(null)
  const [cfgErr, setCfgErr] = useState('')
  const [phone, setPhone] = useState('')
  const [kes, setKes] = useState('')
  const [usdc, setUsdc] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [order, setOrder] = useState<RampOrder | null>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!rampConfigured() || !online) return
    getRampConfig().then(setCfg).catch((e) => setCfgErr(e instanceof Error ? e.message : 'Could not reach the ramp server.'))
  }, [online])

  function track(o: RampOrder) {
    setOrder(o)
    upsertOrder({ id: o.id, kind: o.kind, status: o.status, usdc: String(o.usdc), kes: String(o.kes), ts: Date.now() })
    if (poll.current) clearInterval(poll.current)
    if (TERMINAL.includes(o.status)) return
    poll.current = setInterval(async () => {
      try {
        const n = await getOrder(o.id)
        setOrder(n)
        upsertOrder({ id: n.id, kind: n.kind, status: n.status, usdc: String(n.usdc), kes: String(n.kes), ts: Date.now() })
        if (TERMINAL.includes(n.status) && poll.current) { clearInterval(poll.current); poll.current = null; bal.refresh() }
      } catch { /* retry next tick */ }
    }, 3000)
  }
  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  const phoneNorm = normalizeKenyanPhone(phone)
  const kesNum = Number(kes)
  const usdcNum = Number(usdc)
  const onPreview = cfg ? previewOnramp(kesNum, cfg) : 0
  const offPreview = cfg ? previewOfframp(usdcNum, cfg) : 0

  let validity = ''
  if (!phoneNorm && phone) validity = 'Enter a Safaricom number like 0712 345 678.'
  if (tab === 'on' && cfg && kes && (kesNum < cfg.minKes || kesNum > cfg.maxKes)) validity = `Amount must be between KES ${cfg.minKes} and KES ${cfg.maxKes}.`
  let usdcUnits = 0n
  if (tab === 'off' && usdc) { try { usdcUnits = parseUsdc(usdc); if (bal.wallet !== null && usdcUnits > bal.wallet) validity = 'More than your on-chain USDC balance.' } catch (e) { validity = (e as Error).message } }
  if (tab === 'off' && cfg && usdc && !validity) {
    const k = offPreview
    if (k < cfg.minKes) validity = `Minimum cash-out is about KES ${cfg.minKes}.`
    if (k > cfg.maxKes) validity = `Maximum cash-out is about KES ${cfg.maxKes}.`
  }
  const ready = !!cfg && !!phoneNorm && !validity && (tab === 'on' ? kesNum > 0 : usdcUnits > 0n) && online

  async function submit() {
    if (!cfg || !phoneNorm) return
    setBusy(true)
    setErr('')
    try {
      const acct = getAccount()
      if (tab === 'on') {
        track(await startOnramp(acct, phoneNorm, Math.round(kesNum)))
      } else {
        const hash = await sendUsdcOnline(cfg.treasury, usdcUnits)
        track(await startOfframp(acct, phoneNorm, usdc, hash))
      }
    } catch (e) {
      setErr(explainTxError(e))
    } finally { setBusy(false) }
  }

  return (
    <div>
      <ScreenHeader title="Add money · Cash out" to="/app" />
      <div className="screen">
        {!rampConfigured() ? (
          <Card tone="warning">
            <div style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>Ramp server not configured</div>
            <p className="subtitle">M-Pesa top-ups and cash-outs need the Wayamesh ramp backend. Set <span className="mono">VITE_RAMP_API_URL</span> when building this site (see the README). Until then, top up free from the Circle faucet.</p>
            <a className="btn secondary" style={{ marginTop: 12 }} href={FAUCET_URL} target="_blank" rel="noreferrer noopener">Get testnet USDC <Icon name="external" size={16} /></a>
          </Card>
        ) : (
          <>
            <div className="banner warn" style={{ fontSize: 12 }}><Icon name="warn" /><span>Testnet app. {cfg?.mock ? 'The ramp server is in MOCK mode: no real money moves.' : 'Ramp orders move real KES, check amounts carefully.'}{RAMP_BASE_URL ? '' : ''}</span></div>
            {cfgErr && <div className="banner err" role="alert"><Icon name="alert" /><span>{cfgErr}</span></div>}
            {!online && <div className="banner warn"><Icon name="warn" /><span>You're offline. Ramp orders need a connection.</span></div>}

            <div className="tabs" role="tablist" aria-label="Ramp direction">
              <button role="tab" aria-selected={tab === 'on'} onClick={() => { setTab('on'); setErr('') }}>Add money</button>
              <button role="tab" aria-selected={tab === 'off'} onClick={() => { setTab('off'); setErr('') }}>Cash out</button>
            </div>

            {order ? (
              <Card>
                <div className="stack">
                  <div className="row"><Eyebrow>{order.kind === 'onramp' ? 'Add money' : 'Cash out'} order</Eyebrow><span className="mono dim ellipsis grow" style={{ textAlign: 'right', fontSize: 11 }}>{order.id}</span></div>
                  <div className="mono" style={{ fontSize: 18 }}>{order.kind === 'onramp' ? `KES ${order.kes} → ${order.usdc} USDC` : `${order.usdc} USDC → KES ${order.kes}`}</div>
                  <Timeline order={order} />
                  {order.mpesaReceipt && <div className="dim">M-Pesa receipt: <span className="mono">{order.mpesaReceipt}</span></div>}
                  {order.txHash && <a className="link" href={txUrl(order.txHash)} target="_blank" rel="noreferrer noopener">View transaction →</a>}
                  {TERMINAL.includes(order.status) && <Button variant="secondary" onClick={() => { setOrder(null); setKes(''); setUsdc('') }}>New order</Button>}
                </div>
              </Card>
            ) : (
              <form className="stack" onSubmit={(e) => { e.preventDefault(); if (ready) void submit() }}>
                <Field label="M-Pesa phone" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={(e: any) => { setPhone(e.target.value); setErr('') }}
                  right={<span className="mono muted" style={{ fontSize: 13 }}>+254</span>}
                  error={!!phone && !phoneNorm} hint={phoneNorm ? `Sending to +${phoneNorm}` : 'Safaricom number (the one that holds your M-Pesa)'} hintActive={!!phoneNorm} />
                {tab === 'on' ? (
                  <Field label="Amount (KES)" inputMode="numeric" placeholder="1000" value={kes} onChange={(e: any) => { setKes(e.target.value.replace(/[^\d]/g, '')); setErr('') }}
                    error={!!validity && !!kes} hint={cfg ? (kesNum > 0 ? `≈ ${onPreview.toFixed(2)} USDC after fees` : `KES ${cfg.minKes} – ${cfg.maxKes}`) : 'Loading rates…'} hintActive={kesNum > 0} />
                ) : (
                  <Field label="Amount (USDC)" inputMode="decimal" placeholder="5.00" value={usdc} onChange={(e: any) => { setUsdc(e.target.value); setErr('') }}
                    error={!!validity && !!usdc} hint={cfg ? (usdcNum > 0 ? `≈ KES ${offPreview.toFixed(0)} after fees · you have ${fmt2(bal.wallet ?? 0n)} USDC on-chain` : `You have ${fmt2(bal.wallet ?? 0n)} USDC on-chain`) : 'Loading rates…'} hintActive={usdcNum > 0}
                    right={<button type="button" className="link" onClick={() => bal.wallet && setUsdc((Number(bal.wallet) / 1e6 - 0.01 > 0 ? Number(bal.wallet) / 1e6 - 0.01 : 0).toFixed(2))}>MAX</button>} />
                )}
                {cfg && <p className="dim">Rate: 1 USD ≈ KES {cfg.usdKes} · fee {(cfg.feeBps / 100).toFixed(2)}% · network {cfg.network}</p>}
                {validity && <p className="error-text" role="alert">{validity}</p>}
                {err && <div className="banner err" role="alert"><Icon name="alert" /><span>{err}</span></div>}
                {tab === 'off' && <p className="dim">Cashing out first sends your USDC to the ramp treasury ({cfg ? `${cfg.treasury.slice(0, 8)}…${cfg.treasury.slice(-6)}` : '…'}) from your on-chain balance, then pays KES to your phone. Money in your offline reserve must be withdrawn to your wallet first.</p>}
                <p className="dim">You sign a message to prove this is your wallet. It costs nothing{tab === 'off' ? ' (the USDC transfer costs a small network fee).' : '.'}</p>
                <Button type="submit" size="lg" loading={busy} disabled={!ready || busy}>{tab === 'on' ? 'Send M-Pesa prompt' : 'Cash out to M-Pesa'}</Button>
              </form>
            )}

            {orders.length > 0 && !order && (
              <>
                <Eyebrow>Recent orders</Eyebrow>
                {orders.slice(0, 5).map((o) => (
                  <button key={o.id} className="card tight" style={{ textAlign: 'left', width: '100%' }} onClick={async () => { try { track(await getOrder(o.id)) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load order') } }}>
                    <div className="row"><span className="mono">{o.kind === 'onramp' ? `KES ${o.kes}` : `${o.usdc} USDC`}</span><span className="grow" /><span className="dim">{o.status}</span></div>
                    <div className="dim" style={{ fontSize: 11 }}>{new Date(o.ts).toLocaleString()}</div>
                  </button>
                ))}
              </>
            )}
          </>
        )}
        <p className="dim"><Icon name="shield" size={13} /> Your keys stay in this browser. Purchases and payouts are handled by the ramp server; USDC goes straight to your address.</p>
        <Link to="/app/reserve" className="link">Move money into your offline reserve →</Link>
      </div>
    </div>
  )
}
