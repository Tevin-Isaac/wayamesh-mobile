import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getAddress, isAddress, type Address } from 'viem'
import { useSession } from '@/lib/session'
import { useData } from '@/lib/store'
import { useBalances, estimateTransferFee, sendUsdcOnline } from '@/lib/onchain'
import { useOnline } from '@/lib/net'
import { createSignedPayment, PaymentBlocked } from '@/lib/pay'
import { fmt2, formatUsdc, midAddr, parseUsdc } from '@/lib/money'
import { txUrl } from '@/lib/chain'
import { explainTxError } from '@/lib/useSettle'
import { useT } from '@/lib/i18n'
import { Avatar, Button, Card, DetailRow, Field, ScreenHeader, Toggle, getContactName } from '@/components/ui'
import { Icon } from '@/components/Icon'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const
const RESERVE_DUST = 0.0001

export function normalizeAmount(prev: string, k: string): string {
  if (k === 'del') return prev.slice(0, -1)
  if (k === '.' && prev.includes('.')) return prev
  if (k === '.' && prev === '') return '0.'
  if (prev.includes('.') && prev.split('.')[1].length >= 6) return prev
  if (prev === '0' && k !== '.') return k
  return (prev + k).slice(0, 12)
}

export function Send() {
  const { address } = useSession()
  const { contacts } = useData()
  const bal = useBalances(address)
  const nav = useNavigate()
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const [to, setTo] = useState(params.get('to') ?? '')
  const [amt, setAmt] = useState(params.get('amount') ?? '')

  useEffect(() => {
    const p = params.get('to')
    if (p) setTo(p)
  }, [params])

  const validTo = isAddress(to.trim())
  const toAddr = validTo ? getAddress(to.trim()) : null
  const total = (bal.wallet ?? 0n) + (bal.spendable ?? 0n)
  const avail = Number(formatUsdc(total))
  const num = parseFloat(amt || '0')
  const insufficient = num > 0 && !bal.loading && (bal.wallet !== null || bal.reserve !== null) && num > avail - RESERVE_DUST
  const self = !!toAddr && !!address && toAddr.toLowerCase() === address.toLowerCase()
  const ready = num > 0 && !insufficient && validTo && !self

  return (
    <div>
      <ScreenHeader title={t('send.title', 'Send USDC')} close to="/app" />
      <form
        className="screen"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready && toAddr) nav(`/app/confirm?to=${toAddr}&amount=${encodeURIComponent(amt)}`)
        }}
      >
        {toAddr ? (
          <div className="to-card">
            <Avatar seed={getContactName(toAddr)} size={40} />
            <div className="grow">
              <div className="eyebrow">TO</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>{getContactName(toAddr) !== `${toAddr.slice(0, 6)}…${toAddr.slice(-4)}` ? getContactName(toAddr) : `${toAddr.slice(0, 10)}…${toAddr.slice(-8)}`}</div>
            </div>
            <button type="button" className="icon-btn" onClick={() => { setTo(''); setParams({}) }} aria-label="Clear recipient"><Icon name="x" size={20} /></button>
          </div>
        ) : (
          <>
            <Field
              mono value={to} onChange={(e: any) => setTo(e.target.value)} placeholder="Recipient address (0x…)" aria-label="Recipient address"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              error={!!to.trim() && !validTo} hint={to.trim() && !validTo ? 'Not a valid address' : undefined}
              right={<Link to="/app/scan?for=send" aria-label="Scan a QR code" className="icon-btn" style={{ color: 'var(--accent)' }}><Icon name="qr" /></Link>}
            />
            {contacts.length > 0 && (
              <div className="chips" aria-label="Contacts">
                {contacts.map((c) => (
                  <button type="button" key={c.address} className="chip" onClick={() => setTo(c.address)}>
                    <Avatar seed={c.name} size={26} /> {c.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {self && <p className="error-text" role="alert">That is this wallet. Pick another address.</p>}

        <div className="amount-area">
          <div className="amount-row">
            <span className="sym">$</span>
            <input
              inputMode="decimal" aria-label="Amount in USDC" placeholder="0" value={amt}
              onChange={(e) => { const v = e.target.value; if (/^\d{0,9}\.?\d{0,6}$/.test(v)) setAmt(v) }}
              style={{ width: `${Math.max(2, (amt || '0').length + 0.5)}ch` }}
            />
          </div>
          <div className="dim" style={{ marginTop: 4 }}>USDC · {avail.toFixed(2)} available</div>
          {insufficient && <p className="error-text" role="alert">Insufficient balance</p>}
        </div>

        <div className="keypad" aria-label="Number pad">
          {KEYS.map((k) => (
            <button type="button" key={k} className="key" onClick={() => setAmt((p) => normalizeAmount(p, k))} aria-label={k === 'del' ? 'Delete' : k}>
              {k === 'del' ? <Icon name="backspace" /> : k}
            </button>
          ))}
        </div>

        <p className="dim center-text">{t('send.previewNote', 'Network fee shown next · signed offline · settles on Arc when you reconnect')}</p>
        <Button type="submit" size="lg" icon="lock" disabled={!ready}>{t('send.review', 'Review Transaction')}</Button>
      </form>
    </div>
  )
}

type Step = 'review' | 'signing' | 'done' | 'error'

export function Confirm() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { address } = useSession()
  const bal = useBalances(address)
  const online = useOnline()
  const { t } = useT()
  const to = params.get('to') ?? ''
  const amountStr = params.get('amount') ?? ''
  const valid = isAddress(to) && /^\d*\.?\d+$/.test(amountStr)
  const toAddr = valid ? getAddress(to) : null
  const amount = useMemo(() => { try { return parseUsdc(amountStr) } catch { return 0n } }, [amountStr])

  const [offline, setOffline] = useState<boolean | null>(null)
  const [tip, setTip] = useState('')
  const [fee, setFee] = useState<string | null | undefined>(undefined)
  const [step, setStep] = useState<Step>('review')
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ id?: string; hash?: string }>({})

  const reserveOk = bal.spendable !== null && bal.spendable >= amount
  const mode = offline ?? reserveOk
  const tipUnits = useMemo(() => { try { return tip ? parseUsdc(tip) : 0n } catch { return -1n } }, [tip])

  useEffect(() => {
    if (!toAddr || !address || !online || mode) return
    let live = true
    setFee(undefined)
    estimateTransferFee(address, toAddr, amount).then((f) => live && setFee(f))
    return () => { live = false }
  }, [toAddr, address, online, mode, amount])

  if (!valid || !toAddr || amount <= 0n) {
    return <div><ScreenHeader title="Confirm" close to="/app/send" /><div className="screen center"><p className="subtitle">Missing or invalid payment details.</p><Link className="btn" to="/app/send">Back to Send</Link></div></div>
  }

  const sufficient = mode
    ? bal.spendable !== null && tipUnits >= 0n && amount + tipUnits <= bal.spendable
    : bal.wallet !== null && amount <= bal.wallet
  const feeNum = fee ? Number(fee) : 0.00084

  async function confirm() {
    if (!toAddr) return
    setStep('signing')
    setErr('')
    try {
      if (mode) {
        const { item } = await createSignedPayment(toAddr, amount, { spendable: bal.spendable, fee: tipUnits > 0n ? tipUnits : 0n })
        setResult({ id: item.id })
      } else {
        if (!online) throw new Error('You are offline. Sign from your reserve instead, or reconnect.')
        const hash = await sendUsdcOnline(toAddr, amount)
        setResult({ hash })
      }
      setStep('done')
    } catch (e) {
      setErr(e instanceof PaymentBlocked ? e.message : explainTxError(e))
      setStep('error')
    }
  }

  if (step === 'done') {
    return (
      <div className="screen center">
        <div className="big-circle"><Icon name="check" /></div>
        <div className="big-amount">${Number(formatUsdc(amount)).toFixed(2)}</div>
        <p className="subtitle">sent to <span className="mono" style={{ color: 'var(--text)' }}>{toAddr.slice(0, 6)}…{toAddr.slice(-4)}</span></p>
        {result.id ? (
          <>
            <span className="pill"><Icon name="zap" size={15} />{t('confirm.signed', 'Transaction signed')}</span>
            <p className="dim" style={{ maxWidth: 380 }}>Settles on Arc the moment any device with this code goes online. Hand it to the receiver by QR to let them settle it first.</p>
            <div className="stack" style={{ width: '100%', maxWidth: 380 }}>
              <Link to={`/app/payment/${encodeURIComponent(result.id)}`} className="btn secondary"><Icon name="qr" size={17} />Hand to receiver via QR</Link>
              <Link to="/app" className="btn">Done</Link>
            </div>
          </>
        ) : (
          <>
            <span className="pill"><Icon name="zap" size={15} />Sent on Arc</span>
            {result.hash && <a className="link" href={txUrl(result.hash)} target="_blank" rel="noreferrer noopener">{t('confirm.explorer', 'View on Arc Explorer →')}</a>}
            <div className="stack" style={{ width: '100%', maxWidth: 380 }}><Link to="/app" className="btn">{t('confirm.backWallet', 'Back to Wallet')}</Link></div>
          </>
        )}
      </div>
    )
  }
  if (step === 'error') {
    return (
      <div className="screen center">
        <div className="big-circle err"><Icon name="alert" /></div>
        <h1 className="title">{t('confirm.failed', 'Transaction failed')}</h1>
        <p className="subtitle" role="alert">{err}</p>
        <div className="stack" style={{ width: '100%', maxWidth: 380 }}><Button onClick={() => setStep('review')}>{t('confirm.retry', 'Try again')}</Button></div>
      </div>
    )
  }

  return (
    <div>
      <ScreenHeader title="Review" to="/app/send" />
      <div className="screen">
        <div className="center-text"><span className="big-amount">{Number(formatUsdc(amount)).toFixed(6)}</span> <span className="muted" style={{ fontSize: 18 }}>USDC</span></div>

        <div className="detail">
          <DetailRow k={t('confirm.from', 'From')}><span className="mono">{address ? midAddr(address) : '—'}</span></DetailRow>
          <DetailRow k={t('confirm.to', 'To')}><span className="mono">{midAddr(toAddr)}</span></DetailRow>
          <DetailRow k={t('confirm.fullAddress', 'Full address')}><span className="mono" style={{ fontSize: 12 }}>{toAddr}</span></DetailRow>
        </div>

        <Card>
          <div className="row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Sign offline from reserve</div>
              <div className="dim">
                {mode ? 'Works with no internet. The receiver (or any device) settles it from your offline reserve.' : 'Off: pays now from your on-chain wallet and needs a connection.'}
              </div>
            </div>
            <Toggle checked={mode} onChange={setOffline} label="Sign offline from reserve" />
          </div>
          {mode && !reserveOk && <p className="error-text" style={{ marginTop: 8 }}>Your offline reserve (${fmt2(bal.spendable ?? 0n)}) is lower than this payment. <Link to="/app/reserve" className="link">Add to reserve</Link></p>}
        </Card>

        {mode && (
          <Field label="Courier tip (optional, USDC)" inputMode="decimal" value={tip} onChange={(e: any) => setTip(e.target.value)} placeholder="0" error={tipUnits < 0n} hint={tipUnits < 0n ? 'Enter a USDC amount' : 'Paid from your reserve to whoever settles the payment.'} />
        )}

        <div className="detail">
          <DetailRow k={t('confirm.amount', 'Amount')}>{Number(formatUsdc(amount)).toFixed(6)} USDC</DetailRow>
          {mode ? (
            <>
              <DetailRow k="Courier tip">{tipUnits > 0n ? `${formatUsdc(tipUnits)} USDC` : 'None'}</DetailRow>
              <DetailRow k={t('confirm.networkFee', 'Network fee')}><span className="muted">None to sign · the settler pays it</span></DetailRow>
              <DetailRow k={t('confirm.total', 'Total (max)')}><b className="mono">{formatUsdc(amount + (tipUnits > 0n ? tipUnits : 0n))} USDC</b></DetailRow>
            </>
          ) : (
            <>
              <DetailRow k={t('confirm.networkFee', 'Network fee')}>
                {fee === undefined ? <span className="muted">{t('confirm.estimating', 'Estimating network fee…')}</span> : fee ? `${Number(fee).toFixed(6)} USDC` : <span className="muted">{t('confirm.offlineFee', 'Offline — using ~0.000840 USDC estimate')}</span>}
              </DetailRow>
              <DetailRow k={t('confirm.total', 'Total (max)')}><b className="mono">{(Number(formatUsdc(amount)) + feeNum).toFixed(6)} USDC</b></DetailRow>
            </>
          )}
        </div>

        <div className="detail">
          <DetailRow k={t('confirm.network', 'Network')}>Arc Testnet</DetailRow>
          <DetailRow k="Settlement">{t('confirm.finality', '~480ms finality on Arc')}</DetailRow>
          <DetailRow k={t('confirm.relay', 'Delivery')}>{mode ? t('confirm.relayValue', 'Signed offline → Arc when online') : 'Sent on-chain now'}</DetailRow>
        </div>

        {!sufficient && (bal.wallet !== null || bal.reserve !== null) && (
          <div className="banner warn"><Icon name="warn" /><span>{mode ? `Not enough in your offline reserve. Available: ${fmt2(bal.spendable ?? 0n)} USDC.` : t('confirm.insufficient', 'Insufficient balance for amount + fee. Balance: {{balance}} USDC', { balance: fmt2(bal.wallet ?? 0n) })}</span></div>
        )}

        <div className="row" style={{ gap: 12 }}>
          <Link to="/app/send" className="btn ghost" style={{ flex: 1 }}>{t('confirm.cancel', 'Cancel')}</Link>
          <Button style={{ flex: 2 }} onClick={confirm} loading={step === 'signing'} disabled={!sufficient || step === 'signing' || (!mode && !online)} icon="lock">
            {mode ? t('confirm.confirmSign', 'Confirm & Sign') : 'Confirm & Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
