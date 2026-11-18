import { Link } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { useData } from '@/lib/store'
import { useBalances } from '@/lib/onchain'
import { useOnline } from '@/lib/net'
import { buildHistory, type HistoryRow } from '@/lib/history'
import { fmt2, shortAddr } from '@/lib/money'
import { FAUCET_URL } from '@/lib/chain'
import { useSettle } from '@/lib/useSettle'
import { useT } from '@/lib/i18n'
import { Avatar, Button, Eyebrow, QuickAction, Sparkline, StatusDot, getContactName, toast, copyWithAutoClear } from '@/components/ui'
import { Icon } from '@/components/Icon'

export function ActivityRow({ row }: { row: HistoryRow }) {
  const incoming = row.dir === 'in'
  const sign = incoming ? '+' : row.dir === 'self' ? '' : '−'
  const name = row.kind === 'deposit' || row.kind === 'withdraw' ? row.label! : getContactName(row.who)
  return (
    <div className="activity">
      <Avatar seed={row.who} size={42} dir={row.dir === 'self' ? undefined : row.dir} />
      <div className="grow">
        <div className="who ellipsis">{name}</div>
        <div className="date">{new Date(row.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{row.carrying ? ' · carrying' : ''}</div>
      </div>
      <div>
        <div className={`amt ${incoming ? 'in' : ''}`}>{sign}{(Number(row.amount) / 1e6).toFixed(2)}</div>
        <div style={{ textAlign: 'right', marginTop: 3 }}><StatusDot status={row.status} /></div>
      </div>
    </div>
  )
}

export function Wallet() {
  const { address } = useSession()
  const { t } = useT()
  const online = useOnline()
  const data = useData()
  const bal = useBalances(address)
  const { settle, busy } = useSettle()

  const total = (bal.wallet ?? 0n) + (bal.reserve ?? 0n)
  const [whole, dec] = fmt2(total).split('.')
  const rows = buildHistory(data.items, data.activity, address)
  const recent = rows.slice(0, 4)
  const pendingItems = data.items.filter((i) => i.status === 'pending')
  const toSettle = pendingItems.filter((i) => i.source === 'received')

  const spark = (() => {
    const amts = rows.slice(0, 8).reverse().map((r) => Number(r.amount) / 1e6)
    if (amts.length < 2) return []
    let acc = 0
    return amts.map((a) => (acc += a))
  })()

  async function copyAddr() {
    if (!address) return
    toast((await copyWithAutoClear(address, 30_000)) ? t('wallet.copied', 'Copied') + ' — address copied.' : 'Could not copy.')
  }

  const unknown = bal.wallet === null && bal.reserve === null
  return (
    <div className="screen">
      <div className="topbar">
        <div className="row">
          <Avatar seed={address ?? 'You'} size={40} />
          <div>
            <div className="dim" style={{ fontSize: 12 }}>Welcome back</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Your wallet</div>
          </div>
        </div>
        <span className={`live-pill ${online ? '' : 'off'}`}><i />{online ? 'Arc Testnet' : 'Offline'}</span>
      </div>

      <div className="hero-balance">
        <div className="glow" />
        <Eyebrow>Total balance</Eyebrow>
        <div className="balance" aria-label={`Total balance ${fmt2(total)} USDC`}>
          <span className="sym">$</span>
          <span className="whole">{unknown && bal.loading ? '—' : whole}</span>
          <span className="dec">.{unknown && bal.loading ? '00' : dec}</span>
        </div>
        <button className="addr-pill" onClick={copyAddr} aria-label="Copy wallet address">
          <Icon name="copy" size={12} />
          <span>{address ? `${address.slice(0, 10)}…${address.slice(-6)}` : '—'}</span>
        </button>
        <div className="split">
          <div><div className="k">On-chain</div><div className="v">${fmt2(bal.wallet ?? 0n)}</div></div>
          <div><div className="k">Offline reserve</div><div className="v">${fmt2(bal.spendable ?? 0n)}</div></div>
        </div>
        {bal.error && online && <p className="error-text" style={{ marginTop: 8 }} role="alert">Could not reach Arc: {bal.error.slice(0, 80)}</p>}
        {!bal.live && !unknown && <p className="dim" style={{ marginTop: 8 }}>Showing the last balance this device saw.</p>}
      </div>

      <Sparkline points={spark} />

      <div className="actions">
        <QuickAction icon="up" label="Send" to="/app/send" primary />
        <QuickAction icon="down" label="Receive" to="/app/receive" />
        <QuickAction icon="scan" label="Scan" to="/app/scan" />
        <QuickAction icon="plus" label="Add" to="/app/reserve" />
      </div>

      <Link to="/app/ramp" className="card link-card">
        <span className="ico"><Icon name="card" /></span>
        <span className="grow"><div className="t">Add money · Cash out</div><div className="s">Top up with M-Pesa or withdraw to your phone</div></span>
        <Icon name="right" className="muted" />
      </Link>
      <Link to="/app/mesh" className="card link-card">
        <span className="ico"><Icon name="radio" /></span>
        <span className="grow"><div className="t">Mesh &amp; handoff</div><div className="s">Hand payments over by QR or share sheet</div></span>
        <Icon name="right" className="muted" />
      </Link>

      {pendingItems.length > 0 && (
        <div className="pending-card">
          <i />
          <div className="grow">
            <div className="t">{t('wallet.pending', '{{count}} tx pending settlement', { count: pendingItems.length })}</div>
            <div className="s">Hand over by QR · settles on Arc when a device is online</div>
          </div>
          {toSettle.length > 0 && online && (
            <Button variant="secondary" className="inline" loading={busy} onClick={() => void settle(toSettle)} style={{ minHeight: 40, padding: '8px 14px', fontSize: 14 }}>Settle</Button>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <Eyebrow>{t('wallet.recent', 'Recent')}</Eyebrow>
        {rows.length > 4 && <Link to="/app/history" className="link" style={{ textDecoration: 'none', fontWeight: 600 }}>See all</Link>}
      </div>
      {recent.length > 0 ? recent.map((r) => <ActivityRow key={r.key} row={r} />) : (
        <p className="dim" style={{ lineHeight: 1.6 }}>No transactions yet — send USDC offline and it'll appear here.</p>
      )}

      {(bal.wallet ?? 0n) === 0n && (bal.reserve ?? 0n) === 0n && (
        <p className="dim">
          {t('wallet.faucet', 'Need testnet USDC?')}{' '}
          <a className="link" href={FAUCET_URL} target="_blank" rel="noreferrer noopener">{t('wallet.faucetLink', 'Get 20 USDC free from Circle →')}</a>
          {' '}Send it to {address ? shortAddr(address) : 'your address'}. It also pays network fees.
        </p>
      )}
    </div>
  )
}
