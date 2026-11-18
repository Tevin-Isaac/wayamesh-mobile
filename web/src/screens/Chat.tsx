import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getAddress, isAddress } from 'viem'
import { useData, addMessage, upsertContact, getContact, type ChatMessage } from '@/lib/store'
import { useSession } from '@/lib/session'
import { useBalances } from '@/lib/onchain'
import { createSignedPayment } from '@/lib/pay'
import { parseUsdc, formatUsdc, shortAddr } from '@/lib/money'
import { useT } from '@/lib/i18n'
import { Avatar, Button, Field, Modal, ScreenHeader, toast } from '@/components/ui'
import { Icon } from '@/components/Icon'

export function Chats() {
  const { contacts, messages } = useData()
  const nav = useNavigate()
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const prefill = params.get('new') ?? ''
  const [adding, setAdding] = useState(!!prefill)
  const [name, setName] = useState('')
  const [addr, setAddr] = useState(prefill)
  const [err, setErr] = useState('')

  useEffect(() => { if (prefill) { setAddr(prefill); setAdding(true) } }, [prefill])

  const convos = contacts
    .map((c) => {
      const last = [...messages].reverse().find((m) => m.peer.toLowerCase() === c.address.toLowerCase())
      return { c, last }
    })
    .sort((a, b) => (b.last?.ts ?? b.c.addedAt) - (a.last?.ts ?? a.c.addedAt))

  function preview(m?: ChatMessage) {
    if (!m) return 'Tap to start chatting'
    if (m.kind === 'payment') return `💸 ${m.amount} USDC`
    return m.body ?? ''
  }

  function close() { setAdding(false); setErr(''); if (prefill) setParams({}) }

  function save() {
    const a = addr.trim()
    if (!isAddress(a)) return setErr('Enter a valid 0x wallet address')
    if (!name.trim()) return setErr('Give this contact a name')
    const address = getAddress(a)
    upsertContact({ address, name: name.trim(), addedAt: Date.now() })
    setName(''); setAddr(''); close()
    nav(`/app/chat/${address}`)
  }

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="heading">{t('chat.title', 'Chats')}</h1>
        <button className="round-btn" onClick={() => setAdding(true)} aria-label="New chat"><Icon name="edit" /></button>
      </div>
      <div className="banner ok" style={{ fontSize: 12 }}><Icon name="info" /><span>Chat text is stored on this device only; it is not sent to the other person yet. Payments are real and travel by QR handoff and on-chain.</span></div>
      {convos.length === 0 ? (
        <div className="stack center-text" style={{ alignItems: 'center', paddingTop: 40 }}>
          <Icon name="chat" size={40} className="muted" />
          <p style={{ fontWeight: 600, color: 'var(--muted)' }}>No conversations yet</p>
          <p className="dim">Add a contact to chat and send USDC in the same place.</p>
          <Button className="inline" onClick={() => setAdding(true)}>New chat</Button>
        </div>
      ) : convos.map(({ c, last }) => (
        <Link key={c.address} to={`/app/chat/${c.address}`} className="convo">
          <Avatar seed={c.name || c.address} size={48} />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <div className="muted ellipsis" style={{ fontSize: 13 }}>{preview(last)}</div>
          </div>
          {last && <span className="dim" style={{ fontSize: 12 }}>{new Date(last.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
        </Link>
      ))}
      {adding && (
        <Modal title="New chat" onClose={close}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
            <Field label="Contact name" value={name} onChange={(e: any) => { setName(e.target.value); setErr('') }} placeholder="Contact name" autoFocus />
            <Field label="Wallet address" mono value={addr} onChange={(e: any) => { setAddr(e.target.value); setErr('') }} placeholder="Wallet address 0x…" autoCapitalize="none" spellCheck={false} error={!!err} hint={err || undefined}
              right={<Link to="/app/scan?for=chat" className="icon-btn" aria-label="Scan address" style={{ color: 'var(--accent)' }}><Icon name="qr" /></Link>} />
            <div className="row" style={{ gap: 12 }}>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit">Start chat</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export function ChatThread() {
  const { peer: rawPeer = '' } = useParams()
  const peer = isAddress(rawPeer) ? getAddress(rawPeer) : null
  const { messages, contacts } = useData()
  const { address } = useSession()
  const bal = useBalances(address)
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [payMode, setPayMode] = useState(false)
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const thread = peer ? messages.filter((m) => m.peer.toLowerCase() === peer.toLowerCase()) : []
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [thread.length])
  void contacts

  if (!peer) return <div><ScreenHeader close to="/app/chat" /><div className="screen center"><p className="subtitle">Invalid contact address.</p></div></div>
  const name = getContact(peer)?.name ?? shortAddr(peer)

  function sendText() {
    const body = text.trim()
    if (!body || !peer) return
    addMessage({ peer, dir: 'out', kind: 'text', body })
    setText('')
  }

  async function sendPayment() {
    if (!peer) return
    setErr('')
    setSending(true)
    try {
      const units = parseUsdc(amount)
      const { item } = await createSignedPayment(peer, units, { spendable: bal.spendable })
      addMessage({ peer, dir: 'out', kind: 'payment', amount: formatUsdc(units), itemId: item.id })
      setAmount(''); setPayMode(false)
      toast('Payment signed. Open it to hand the code over.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign')
    } finally { setSending(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="screen-head" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <button className="icon-btn" onClick={() => nav('/app/chat')} aria-label="Back"><Icon name="left" /></button>
        <div className="row grow" style={{ justifyContent: 'center' }}>
          <Avatar seed={name} size={34} />
          <div><div style={{ fontWeight: 600 }}>{name}</div><div className="mono dim" style={{ fontSize: 11 }}>{`${peer.slice(0, 8)}…${peer.slice(-6)}`}</div></div>
        </div>
        <span style={{ width: 40 }} />
      </div>
      <div className="thread grow" role="log" aria-live="polite">
        {thread.length === 0 && <p className="dim center-text">Say hi 👋 — and send USDC right in the chat.</p>}
        {thread.map((m) => m.kind === 'payment' ? (
          <Link key={m.id} to={`/app/payment/${encodeURIComponent(m.itemId ?? '')}`} className={`paymsg ${m.dir}`}>
            <span className="ico" style={{ color: 'var(--accent)' }}><Icon name="cash" /></span>
            <div><div style={{ fontWeight: 600, fontSize: 14 }}>{m.dir === 'out' ? 'You sent' : 'Received'} {m.amount} USDC</div><div className="dim" style={{ fontSize: 12 }}>signed offline · tap for code</div></div>
          </Link>
        ) : <div key={m.id} className={`bubble ${m.dir}`}>{m.body}</div>)}
        <div ref={endRef} />
      </div>
      {payMode && (
        <div>
          <div className="paybar">
            <span className="muted">$</span>
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setErr('') }} aria-label="Amount in USDC" autoFocus />
            <span className="dim" style={{ fontSize: 12 }}>{formatUsdc(bal.spendable ?? 0n).slice(0, 8)} avail</span>
            <Button className="inline" loading={sending} onClick={sendPayment} disabled={!amount} style={{ minHeight: 40, padding: '8px 14px', fontSize: 14 }}>Send USDC</Button>
          </div>
          {err && <p className="error-text" style={{ padding: '0 20px 8px' }} role="alert">{err}</p>}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); sendText() }}>
        <button type="button" className={`round-btn alt ${payMode ? 'on' : ''}`} onClick={() => setPayMode((p) => !p)} aria-label="Send USDC" aria-pressed={payMode}><Icon name="cash" /></button>
        <textarea rows={1} value={text} placeholder="Message" aria-label="Message" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }} />
        <button type="submit" className="round-btn" disabled={!text.trim()} aria-label="Send message"><Icon name="up" /></button>
      </form>
    </div>
  )
}
