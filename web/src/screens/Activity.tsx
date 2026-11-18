import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { useData } from '@/lib/store'
import { buildHistory, type HistoryRow } from '@/lib/history'
import { useBalances, addToReserve, cancelWithdraw, finalizeWithdraw, readWithdrawal, requestWithdraw } from '@/lib/onchain'
import { useOnline } from '@/lib/net'
import { formatUsdc, fmt2, fmtFull, midAddr, parseUsdc, shortAddr } from '@/lib/money'
import { encodeVoucher, WITHDRAW_DELAY_SECONDS } from '@/lib/mesh'
import { toVoucher } from '@/lib/items'
import { explainTxError, useSettle } from '@/lib/useSettle'
import { txUrl, FAUCET_URL } from '@/lib/chain'
import { useT } from '@/lib/i18n'
import { Badge, Button, Card, Eyebrow, Field, ScreenHeader, toast, copyPlain, getContactName } from '@/components/ui'
import { Icon } from '@/components/Icon'

type BadgeStatus = 'pending' | 'relayed' | 'settled' | 'failed'

function TxCard({ row }: { row: HistoryRow }) {
  const incoming = row.dir === 'in'
  const date = new Date(row.ts).toLocaleString()
  const title = row.kind === 'deposit' || row.kind === 'withdraw' ? row.label! : `${incoming ? '+' : row.dir === 'out' ? '−' : ''}${fmtFull(row.amount)} USDC`
  const inner = (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: incoming ? 'var(--success)' : undefined }}>{title}</span>
        <Badge status={row.status as BadgeStatus}>{row.rawStatus === 'settled' ? 'settled' : row.rawStatus}</Badge>
      </div>
      {(row.kind === 'deposit' || row.kind === 'withdraw') && <div className="mono muted" style={{ fontSize: 12 }}>{fmtFull(row.amount)} USDC</div>}
      {row.kind !== 'deposit' && row.kind !== 'withdraw' && (
        <div className="mono muted ellipsis" style={{ fontSize: 12 }}>{incoming ? `From: ${getContactName(row.who)}` : `To: ${getContactName(row.who)}`}{row.carrying ? ' · carrying' : ''}</div>
      )}
      <div className="dim" style={{ fontSize: 11 }}>{date}{row.note ? ` · ${row.note}` : ''}</div>
    </>
  )
  if (row.item && row.item.status === 'pending') {
    return <Link to={`/app/payment/${encodeURIComponent(row.item.id)}`} className="card tight" style={{ display: 'block' }}>{inner}</Link>
  }
  return (
    <div className="card tight">
      {inner}
      {row.txHash && <a className="link" style={{ fontSize: 12 }} href={txUrl(row.txHash)} target="_blank" rel="noreferrer noopener">View on Arc Explorer →</a>}
    </div>
  )
}

export function History() {
  const { address } = useSession()
  const { items, activity } = useData()
  const online = useOnline()
  const { t } = useT()
  const { settle, busy } = useSettle()
  const rows = buildHistory(items, activity, address)
  const toSettle = items.filter((i) => i.status === 'pending' && i.source === 'received')
  return (
    <div className="screen">
      <h1 className="heading">{t('history.title', 'History')}</h1>
      {toSettle.length > 0 && (
        <Card accent>
          <div className="row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{toSettle.length} payment{toSettle.length === 1 ? '' : 's'} ready to settle</div>
              <div className="dim">{online ? 'Settles on Arc in one transaction. You pay the network fee in USDC.' : 'Reconnect to settle.'}</div>
            </div>
            <Button className="inline" disabled={!online} loading={busy} onClick={() => void settle(toSettle)} style={{ minHeight: 44, padding: '8px 16px' }}>Settle{toSettle.length > 1 ? ' all' : ''}</Button>
          </div>
        </Card>
      )}
      {rows.length === 0 ? (
        <div className="center-text" style={{ paddingTop: 48 }}>
          <p style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 600 }}>{t('history.empty', 'No transactions yet')}</p>
          <p className="dim" style={{ marginTop: 4 }}>{t('history.emptyHint', "Send USDC offline — it'll appear here")}</p>
        </div>
      ) : rows.map((r) => <TxCard key={r.key} row={r} />)}
    </div>
  )
}

function useCountdown(unlockAt: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, unlockAt - Math.floor(now / 1000))
}

function fmtCountdown(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`
}

/** Add to reserve (approve + deposit) and the 24-hour withdraw flow. */
export function Reserve() {
  const { address } = useSession()
  const nav = useNavigate()
  const online = useOnline()
  const bal = useBalances(address)
  const [add, setAdd] = useState('')
  const [wd, setWd] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [req, setReq] = useState<{ amount: bigint; unlockAt: bigint } | null>(null)
  const left = useCountdown(req ? Number(req.unlockAt) : 0)

  const loadReq = async () => {
    if (!address || !online) return
    try { const r = await readWithdrawal(address); setReq(r.amount > 0n ? r : null) } catch { /* ignore */ }
  }
  useEffect(() => { void loadReq() }, [address, online])

  async function run(label: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(label)
    try { await fn(); toast(ok); bal.refresh(); await loadReq() } catch (e) { toast(explainTxError(e)) } finally { setBusy(null) }
  }

  let addUnits = 0n, addErr = ''
  try { addUnits = add ? parseUsdc(add) : 0n } catch (e) { addErr = (e as Error).message }
  let wdUnits = 0n, wdErr = ''
  try { wdUnits = wd ? parseUsdc(wd) : 0n } catch (e) { wdErr = (e as Error).message }
  const addTooMuch = bal.wallet !== null && addUnits > bal.wallet
  const wdTooMuch = bal.reserve !== null && wdUnits > bal.reserve

  return (
    <div>
      <ScreenHeader title="Offline reserve" to="/app" />
      <div className="screen">
        <div className="detail">
          <div className="drow"><span className="k">On-chain wallet</span><span className="v mono">{fmt2(bal.wallet ?? 0n)} USDC</span></div>
          <div className="drow"><span className="k">Offline reserve</span><span className="v mono">{fmt2(bal.reserve ?? 0n)} USDC</span></div>
          <div className="drow"><span className="k">Promised in unsettled payments</span><span className="v mono">{fmt2(bal.committed)} USDC</span></div>
          <div className="drow"><span className="k">Available to sign offline</span><span className="v mono"><b>{fmt2(bal.spendable ?? 0n)} USDC</b></span></div>
        </div>
        <p className="dim">Payments you sign offline are paid out of this reserve held by the MeshPay contract on Arc, so a receiver can settle them even if you never reconnect. You can pull it back out after a {WITHDRAW_DELAY_SECONDS / 3600}-hour delay.</p>
        {!online && <div className="banner warn"><Icon name="warn" /><span>You're offline. Adding to or withdrawing from the reserve needs a connection.</span></div>}

        <Eyebrow>Add to reserve</Eyebrow>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('add', () => addToReserve(addUnits), 'Added to your offline reserve.') }}>
          <Field label="Amount (USDC)" inputMode="decimal" placeholder="0.00" value={add} onChange={(e: any) => setAdd(e.target.value)} error={!!addErr || addTooMuch} hint={addErr || (addTooMuch ? 'More than your wallet balance' : 'Approves and deposits in up to two transactions; you pay the network fee in USDC.')}
            right={<button type="button" className="link" onClick={() => bal.wallet && setAdd(formatUsdc(bal.wallet > 20_000n ? bal.wallet - 20_000n : 0n))}>MAX</button>} />
          <Button type="submit" loading={busy === 'add'} disabled={!online || addUnits <= 0n || !!addErr || addTooMuch || busy !== null}>Add to reserve</Button>
          {(bal.wallet ?? 0n) === 0n && <p className="dim">Wallet empty? <a className="link" href={FAUCET_URL} target="_blank" rel="noreferrer noopener">Get testnet USDC from Circle's faucet →</a> then send it to {address ? shortAddr(address) : 'your address'}.</p>}
        </form>

        <Eyebrow>Withdraw</Eyebrow>
        {req ? (
          <Card tone="pending">
            <div className="stack">
              <div style={{ fontWeight: 600 }}>Withdrawal of up to {fmt2(req.amount)} USDC requested</div>
              {left > 0 ? <div className="mono">{fmtCountdown(left)} until you can finalize</div> : <div className="banner ok"><Icon name="check" /><span>Ready to finalize. You get the lesser of the request and your remaining reserve.</span></div>}
              <div className="row" style={{ gap: 12 }}>
                <Button variant="secondary" loading={busy === 'cancel'} disabled={busy !== null || !online} onClick={() => void run('cancel', cancelWithdraw, 'Withdrawal cancelled.')}>Cancel request</Button>
                <Button loading={busy === 'fin'} disabled={left > 0 || busy !== null || !online} onClick={() => void run('fin', () => finalizeWithdraw(req.amount), 'Withdrawn to your wallet.')}>Finalize</Button>
              </div>
              <p className="dim">The reserve stays spendable by signed payments while you wait.</p>
            </div>
          </Card>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('req', () => requestWithdraw(wdUnits), 'Withdrawal requested. Finalize it in 24 hours.') }}>
            <Field label="Amount (USDC)" inputMode="decimal" placeholder="0.00" value={wd} onChange={(e: any) => setWd(e.target.value)} error={!!wdErr || wdTooMuch} hint={wdErr || (wdTooMuch ? 'More than your reserve' : `Starts a ${WITHDRAW_DELAY_SECONDS / 3600}-hour timer. Payments you already signed can still settle meanwhile.`)}
              right={<button type="button" className="link" onClick={() => bal.reserve && setWd(formatUsdc(bal.reserve))}>MAX</button>} />
            <Button type="submit" variant="secondary" loading={busy === 'req'} disabled={!online || wdUnits <= 0n || !!wdErr || wdTooMuch || busy !== null}>Request withdrawal</Button>
          </form>
        )}
        <Button variant="ghost" onClick={() => nav('/app')}>Back to wallet</Button>
      </div>
    </div>
  )
}

export function Mesh() {
  const { address } = useSession()
  const { items } = useData()
  const online = useOnline()
  const { settle, busy } = useSettle()
  const { t } = useT()
  const mine = (a: string) => !!address && a.toLowerCase() === address.toLowerCase()
  const queued = items.filter((i) => i.status === 'pending' && !(i.source === 'received' && mine(i.to)))
  const carrying = queued.filter((i) => i.source === 'received')
  const carriedValue = carrying.reduce((s, i) => s + BigInt(i.amount), 0n)
  const tipsAvailable = carrying.reduce((s, i) => s + BigInt(i.fee), 0n)
  const settledForOthers = items.filter((i) => i.source === 'received' && i.status === 'settled' && !mine(i.to))
  const tipsEarned = items.reduce((s, i) => s + BigInt(i.tip ?? '0'), 0n)

  async function shareCode(id: string) {
    const it = items.find((i) => i.id === id)
    if (!it) return
    const code = encodeVoucher(toVoucher(it))
    if (navigator.share) { try { await navigator.share({ title: 'Wayamesh payment', text: code }); return } catch { /* cancelled */ } }
    toast((await copyPlain(code)) ? 'Payment code copied.' : 'Could not copy.')
  }

  return (
    <div className="screen">
      <h1 className="heading">{t('mesh.title', 'Mesh')}</h1>
      <Card tone="warning">
        <div style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>Bluetooth isn't available in browsers</div>
        <p className="subtitle">
          Web browsers can't talk to nearby phones over Bluetooth, so this web wallet hands payments over by QR code or the share sheet instead.
          It's the same signed payment either way — the Android app can also hand it over by Bluetooth, and the two can pay each other.
        </p>
      </Card>

      <Eyebrow>Queued payments</Eyebrow>
      {queued.length === 0 ? (
        <p className="dim">Nothing queued. Sign a payment offline and hand it to the receiver here, or scan one to carry it.</p>
      ) : queued.map((i) => (
        <div key={i.id} className="card tight">
          <div className="row">
            <span className="mono" style={{ fontWeight: 700 }}>${Number(formatUsdc(BigInt(i.amount))).toFixed(2)}</span>
            <span className="muted ellipsis grow" style={{ fontSize: 13 }}>{i.source === 'received' ? 'carrying · ' : ''}to {midAddr(i.to)}</span>
            <Link to={`/app/payment/${encodeURIComponent(i.id)}`} className="icon-btn" aria-label="Show QR code" style={{ color: 'var(--accent)' }}><Icon name="qr" /></Link>
            <button className="icon-btn" aria-label="Share payment code" style={{ color: 'var(--accent)' }} onClick={() => void shareCode(i.id)}><Icon name="share" /></button>
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 12 }}>
        <Link to="/app/scan" className="btn"><Icon name="scan" size={18} />Scan to receive or carry</Link>
      </div>

      <Eyebrow>Courier</Eyebrow>
      <div className="detail">
        <div className="drow"><span className="k">Carrying for others</span><span className="v mono">{carrying.length} · ${fmt2(carriedValue)}</span></div>
        <div className="drow"><span className="k">Tips available on settle</span><span className="v mono">{formatUsdc(tipsAvailable)} USDC</span></div>
        <div className="drow"><span className="k">Settled for others</span><span className="v mono">{settledForOthers.length}</span></div>
        <div className="drow"><span className="k">Tips earned</span><span className="v mono">{formatUsdc(tipsEarned)} USDC</span></div>
      </div>
      {carrying.length > 0 && (
        <Button variant="secondary" loading={busy} disabled={!online} onClick={() => void settle(carrying)}>{online ? `Settle ${carrying.length} carried payment${carrying.length === 1 ? '' : 's'}` : 'Reconnect to settle carried payments'}</Button>
      )}
      <p className="dim">Tips are the optional courier fee the payer included. Anything you carry is checked and settled on-chain; you can't change it.</p>
    </div>
  )
}
