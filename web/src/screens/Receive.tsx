import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { useData, getContact, updateItem, getData } from '@/lib/store'
import { inspectVoucher, ingestVoucher } from '@/lib/ingest'
import { encodeVoucher, isVoucherCode, parseAddressQr, MESHPAY_ABI } from '@/lib/mesh'
import { toVoucher, toPayment } from '@/lib/items'
import { formatUsdc, midAddr, shortAddr } from '@/lib/money'
import { FAUCET_URL, MESHPAY_ADDRESS, publicClient } from '@/lib/chain'
import { cancelSignedPayment } from '@/lib/onchain'
import { useOnline } from '@/lib/net'
import { explainTxError, useSettle } from '@/lib/useSettle'
import { useT } from '@/lib/i18n'
import { Avatar, Button, Card, ScreenHeader, StatusDot, toast, copyPlain, getContactName, Field } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { QrCode, QrScanner } from '@/components/Qr'

export function Receive() {
  const { address } = useSession()
  const { t } = useT()
  async function share() {
    if (!address) return
    if (navigator.share) {
      try { await navigator.share({ text: address }); return } catch { /* cancelled */ }
    }
    toast((await copyPlain(address)) ? 'Address copied.' : 'Could not share.')
  }
  return (
    <div>
      <ScreenHeader close to="/app" />
      <div className="screen" style={{ alignItems: 'center' }}>
        <div className="stack center-text" style={{ width: '100%' }}>
          <h1 className="title">{t('receive.title', 'Receive USDC')}</h1>
          <p className="subtitle">{t('receive.sub', 'Share your address or QR code to receive USDC on Arc.')}</p>
        </div>
        {address ? <QrCode value={`ethereum:${address}`} label="QR code of your wallet address" /> : null}
        <div className="card" style={{ width: '100%' }}>
          <div className="dim">{t('receive.yourAddress', 'Your Arc address')}</div>
          <div className="mono wrap-any" style={{ fontSize: 13, marginTop: 4 }}>{address ?? '—'}</div>
        </div>
        <div className="row" style={{ width: '100%', gap: 12 }}>
          <Button onClick={async () => address && toast((await copyPlain(address)) ? 'Address copied.' : 'Could not copy.')}>{t('receive.copyAddress', 'Copy Address')}</Button>
          <Button variant="secondary" onClick={share}>{t('receive.share', 'Share')}</Button>
        </div>
        <p className="dim">Arc Testnet · USDC native token</p>
        <p className="dim">{t('receive.faucetSub', 'Need testnet USDC?')} <a className="link" href={FAUCET_URL} target="_blank" rel="noreferrer noopener">{t('receive.faucetLink', "Get 20 USDC free from Circle's faucet →")}</a></p>
      </div>
    </div>
  )
}

export function Scan() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const forWhat = params.get('for')
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState('')
  const done = useRef(false)

  function handle(text: string) {
    const v = text.trim()
    if (done.current || !v) return
    if (isVoucherCode(v)) {
      done.current = true
      nav(`/app/receive-payment?code=${encodeURIComponent(v)}`, { replace: true })
      return
    }
    const addr = parseAddressQr(v)
    if (addr) {
      done.current = true
      if ('vibrate' in navigator) navigator.vibrate?.(60)
      nav(forWhat === 'chat' ? `/app/chat?new=${addr}` : `/app/send?to=${addr}`, { replace: true })
      return
    }
    setErr('That code is not a Wayamesh payment or a wallet address.')
  }

  return (
    <div>
      <ScreenHeader title="Scan" close to="/app" />
      <div className="screen">
        <QrScanner onResult={handle} />
        <p className="subtitle center-text">Scan a wallet address or an offline payment code</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); handle(paste) }}>
          <Field label="Or paste a code" mono multiline value={paste} onChange={(e: any) => { setPaste(e.target.value); setErr('') }} placeholder="mp2:… or 0x…" spellCheck={false} error={!!err} hint={err || undefined} />
          <Button variant="secondary" type="submit" disabled={!paste.trim()}>Use pasted code</Button>
        </form>
      </div>
    </div>
  )
}

export function ReceivePayment() {
  const [params] = useSearchParams()
  const code = params.get('code') ?? ''
  const { address } = useSession()
  const online = useOnline()
  const { t } = useT()
  const [res, setRes] = useState<Awaited<ReturnType<typeof inspectVoucher>> | null>(null)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState<{ role: 'recipient' | 'courier'; duplicate: boolean; id: string } | null>(null)
  const { settle, busy } = useSettle()
  useData()

  useEffect(() => {
    let live = true
    inspectVoucher(code).then((r) => live && setRes(r)).catch((e) => live && setError(e instanceof Error ? e.message : 'Invalid payment code'))
    return () => { live = false }
  }, [code])

  if (!res) {
    return (
      <div className="screen center">
        {error ? (
          <>
            <div className="big-circle err"><Icon name="alert" /></div>
            <h1 className="title">Invalid payment</h1>
            <p className="subtitle" role="alert">{error}</p>
            <Link to="/app" className="btn" style={{ maxWidth: 380 }}>Close</Link>
          </>
        ) : <span className="spinner" role="status" aria-label="Verifying payment" />}
      </div>
    )
  }

  const p = res.voucher.payment
  const forMe = !!address && p.to.toLowerCase() === address.toLowerCase()
  const fromName = getContact(p.from)?.name ?? `${p.from.slice(0, 8)}…${p.from.slice(-6)}`
  const amount = Number(formatUsdc(p.amount)).toFixed(2)

  async function accept() {
    try {
      const r = await ingestVoucher(code)
      setAccepted({ role: forMe ? 'recipient' : 'courier', duplicate: !r.added, id: r.item.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept payment')
    }
  }

  if (res.problem) {
    return (
      <div className="screen center">
        <div className="big-circle err"><Icon name="alert" /></div>
        <h1 className="title">Invalid payment</h1>
        <p className="subtitle" role="alert">{res.problem}</p>
        <Link to="/app" className="btn" style={{ maxWidth: 380 }}>Close</Link>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="screen center">
        <div className="big-circle"><Icon name="check" /></div>
        <div className="big-amount">${amount}</div>
        <p className="subtitle">
          {accepted.duplicate ? 'You already hold this payment.' : accepted.role === 'recipient' ? `from ${fromName} — it's yours` : 'You are now carrying this payment'}
        </p>
        <span className="pill"><Icon name="zap" size={15} />Settles on Arc when this device is online</span>
        {accepted.role === 'courier' && p.fee > 0n && <span className="pill"><Icon name="spark" size={15} />Settling it earns you a {formatUsdc(p.fee)} USDC courier tip</span>}
        <p className="dim" style={{ maxWidth: 400 }}>You hold the signed transaction now — the sender doesn't need to reconnect. No one can alter or cancel it once it settles.</p>
        <div className="stack" style={{ width: '100%', maxWidth: 380 }}>
          {online && <Button variant="secondary" loading={busy} onClick={async () => { const it = getItem(accepted.id); if (it) await settle([it]) }}>Settle now</Button>}
          <Link to="/app" className="btn">Done</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <ScreenHeader title="Incoming payment" close to="/app" />
      <div className="screen" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Avatar seed={fromName} size={64} dir="in" />
        <div className="big-amount">${amount}</div>
        <p className="subtitle">from <span className="mono" style={{ color: 'var(--text)' }}>{fromName}</span></p>
        {!forMe && (
          <div className="banner warn" style={{ textAlign: 'left' }}>
            <Icon name="swap" />
            <span>This payment is addressed to <span className="mono">{shortAddr(p.to)}</span>, not to this wallet. You can still carry it — it will settle to them when you're online (mesh courier).</span>
          </div>
        )}
        <div className="detail" style={{ width: '100%', textAlign: 'left' }}>
          <div className="drow"><span className="k">Verified sender</span><span className="v mono">{midAddr(p.from)}</span></div>
          <div className="drow"><span className="k">Recipient</span><span className="v mono">{midAddr(p.to)}</span></div>
          <div className="drow"><span className="k">Network</span><span className="v">Arc · chain 5042002</span></div>
          <div className="drow"><span className="k">Signature</span><span className="v">Valid — amount &amp; recipient sealed</span></div>
          {p.fee > 0n && <div className="drow"><span className="k">Courier tip</span><span className="v">{formatUsdc(p.fee)} USDC</span></div>}
          <div className="drow"><span className="k">Valid until</span><span className="v">{new Date(Number(p.deadline) * 1000).toLocaleString()}</span></div>
        </div>
        <div className="stack" style={{ width: '100%' }}>
          <Button size="lg" icon={forMe ? 'download' : 'branch'} onClick={accept}>{forMe ? 'Accept payment' : 'Carry & relay'}</Button>
          <Link to="/app" className="btn ghost">Decline</Link>
        </div>
      </div>
    </div>
  )
}

function getItem(id: string) {
  return getData().items.find((i) => i.id === id)
}

export function PaymentQr() {
  const { id = '' } = useParams()
  const { address } = useSession()
  const { items } = useData()
  const online = useOnline()
  const item = items.find((i) => i.id === decodeURIComponent(id))
  const [busy, setBusy] = useState(false)

  // Poll the contract so the status flips to Settled live once anyone settles it.
  useEffect(() => {
    if (!item || item.status !== 'pending' || !online) return
    let live = true
    const run = async () => {
      try {
        const code = Number(await publicClient.readContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'check', args: [toPayment(item), item.signature] }))
        if (!live) return
        if (code === 3) updateItem(item.id, { status: 'settled', note: 'Settled on-chain' })
        else if (code === 2) updateItem(item.id, { status: 'expired', note: 'Past its deadline' })
      } catch { /* network hiccup */ }
    }
    void run()
    const t = setInterval(run, 6000)
    return () => { live = false; clearInterval(t) }
  }, [item?.id, item?.status, online])

  const memoCode = useMemo(() => (item ? encodeVoucher(toVoucher(item)) : ''), [item])
  if (!item) return <div><ScreenHeader close to="/app" /><div className="screen center"><p className="subtitle">Payment not found.</p></div></div>

  const who = getContact(item.to)?.name ?? midAddr(item.to)
  const settled = item.status === 'settled'
  const mine = !!address && item.from.toLowerCase() === address.toLowerCase()
  const dead = ['expired', 'invalid', 'duplicate', 'cancelled'].includes(item.status)

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Wayamesh payment', text: memoCode }); return } catch { /* cancelled */ }
    }
    toast((await copyPlain(memoCode)) ? 'Payment code copied. Paste it to the receiver.' : 'Could not copy.')
  }

  async function cancel() {
    if (!item || !window.confirm('Cancel this payment? This burns its nonce on-chain so it can never settle. It needs a connection and a little USDC for the network fee.')) return
    setBusy(true)
    try { await cancelSignedPayment(item); toast('Payment cancelled.') } catch (e) { toast(explainTxError(e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <ScreenHeader title="Payment" close to="/app" />
      <div className="screen" style={{ alignItems: 'center' }}>
        <div className="big-amount">${Number(formatUsdc(BigInt(item.amount))).toFixed(2)}</div>
        <p className="subtitle">to {who}</p>
        <StatusDot status={item.status === 'pending' ? 'pending' : settled ? 'settled' : 'failed'} />
        {item.note && <p className="dim">{item.note}</p>}

        {settled ? (
          <div className="qr-card dark" style={{ flexDirection: 'column', gap: 8 }}>
            <Icon name="checkc" size={56} className="" />
            <div style={{ color: 'var(--accent)', fontWeight: 600 }}>Settled on Arc</div>
          </div>
        ) : dead ? (
          <div className="qr-card dark"><div style={{ color: 'var(--error)' }}>This payment can no longer be used.</div></div>
        ) : <QrCode value={memoCode} ecl="L" label="QR code of the signed payment" />}

        {!settled && !dead && (
          <div className="stack">
            <div className="step-row"><span className="ico"><Icon name="scan" /></span><span>The receiver opens Wayamesh → Scan and points at this code (or pastes the code below).</span></div>
            <div className="step-row"><span className="ico"><Icon name="shield" /></span><span>They now hold the signed payment. It settles the instant either device finds internet — they no longer depend on you reconnecting.</span></div>
            <div className="step-row"><span className="ico"><Icon name="lock" /></span><span>The code is the transaction itself, sealed by your signature — the amount and recipient cannot be altered by anyone.</span></div>
            <div className="row" style={{ gap: 12 }}>
              <Button variant="secondary" icon="share" onClick={share}>Share code</Button>
              <Button variant="secondary" icon="copy" onClick={async () => toast((await copyPlain(memoCode)) ? 'Payment code copied.' : 'Could not copy.')}>Copy code</Button>
            </div>
            {mine && item.status === 'pending' && online && <Button variant="danger" loading={busy} onClick={cancel}>Cancel payment</Button>}
          </div>
        )}
        {item.txHash && <a className="link" href={`https://testnet.arcscan.app/tx/${item.txHash}`} target="_blank" rel="noreferrer noopener">View on Arc Explorer →</a>}
      </div>
    </div>
  )
}
