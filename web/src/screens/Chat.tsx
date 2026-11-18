import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getAddress, isAddress } from 'viem'
import { useData, addMessage, upsertContact, getContact, patchContact, type ChatMessage, type Contact } from '@/lib/store'
import { useSession } from '@/lib/session'
import { useBalances } from '@/lib/onchain'
import { createSignedPayment } from '@/lib/pay'
import { parseUsdc, formatUsdc, shortAddr } from '@/lib/money'
import { useT } from '@/lib/i18n'
import { purgeChat } from '@/lib/store'
import { acceptChatPayment, getMyCard, sendPaymentMessage, sendText, useRelayStatus } from '@/lib/chat/service'
import { chatPubkeyOf, decodeCard, isCard, safetyNumber, type ContactCard } from '@/lib/chat/crypto'
import { getChatKey } from '@/lib/session'
import { Avatar, Button, Field, Modal, ScreenHeader, copyPlain, toast } from '@/components/ui'
import { QrCode, QrScanner } from '@/components/Qr'
import { Icon } from '@/components/Icon'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Waiting to send',
  sent: 'Sent to relays',
  delivered: 'Delivered',
}

export function Chats() {
  const { contacts, messages } = useData()
  const relay = useRelayStatus()
  const nav = useNavigate()
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const prefill = params.get('new') ?? ''
  const [mode, setMode] = useState<'add' | 'card' | null>(prefill ? 'add' : null)

  const convos = contacts
    .map((c) => ({ c, last: [...messages].reverse().find((m) => m.peer.toLowerCase() === c.address.toLowerCase()) }))
    .sort((a, b) => (b.last?.ts ?? b.c.addedAt) - (a.last?.ts ?? a.c.addedAt))

  function preview(c: Contact, m?: ChatMessage) {
    if (!m) return c.pubkey ? 'Tap to start chatting' : 'Add their card to chat'
    if (m.kind === 'payment') return `${m.dir === 'out' ? 'You sent' : 'Payment'} ${m.amount} USDC`
    return (m.dir === 'out' ? 'You: ' : '') + (m.body ?? '')
  }

  function close() { setMode(null); if (prefill) setParams({}) }

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="heading">{t('chat.title', 'Chats')}</h1>
        <div className="row" style={{ gap: 8 }}>
          <button className="round-btn alt" onClick={() => setMode('card')} aria-label="My card"><Icon name="qr" /></button>
          <button className="round-btn" onClick={() => setMode('add')} aria-label="Add contact"><Icon name="plus" /></button>
        </div>
      </div>
      <div className="banner ok" style={{ fontSize: 12 }}>
        <Icon name="info" />
        <span>
          Messages are end-to-end encrypted and sent through public relays.
          {relay.connected > 0 ? ` Online (${relay.connected} of ${relay.total} relays).` : ' Not connected: messages wait and are sent when you are back online.'}
          {' '}A message to someone who is offline is delivered when they come online; relays only hold it for a limited time.
        </span>
      </div>
      {convos.length === 0 ? (
        <div className="stack center-text" style={{ alignItems: 'center', paddingTop: 40 }}>
          <Icon name="chat" size={40} className="muted" />
          <p style={{ fontWeight: 600, color: 'var(--muted)' }}>No conversations yet</p>
          <p className="dim">Add a contact by scanning or pasting their card, or show them yours.</p>
          <Button className="inline" onClick={() => setMode('add')}>Add contact</Button>
        </div>
      ) : convos.map(({ c, last }) => (
        <Link key={c.address} to={`/app/chat/${c.address}`} className="convo">
          <Avatar seed={c.name || c.address} size={48} />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{c.name}{c.request ? ' (request)' : ''}</div>
            <div className="muted ellipsis" style={{ fontSize: 13 }}>{preview(c, last)}</div>
          </div>
          {last && <span className="dim" style={{ fontSize: 12 }}>{new Date(last.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
        </Link>
      ))}
      {mode === 'add' && <AddContact initial={prefill} onClose={close} onDone={(a) => { close(); nav(`/app/chat/${a}`) }} />}
      {mode === 'card' && <MyCard onClose={close} />}
    </div>
  )
}

function AddContact({ initial, onClose, onDone }: { initial: string; onClose: () => void; onDone: (address: string) => void }) {
  const [text, setText] = useState(isCard(initial) ? initial : '')
  const [card, setCard] = useState<ContactCard | null>(null)
  const [name, setName] = useState('')
  const [safety, setSafety] = useState('')
  const [err, setErr] = useState('')
  const [scan, setScan] = useState(false)

  function accept(raw: string) {
    setErr('')
    if (!isCard(raw)) return setErr('That is not a contact card. A card starts with mpc1:')
    try {
      const c = decodeCard(raw)
      const address = getAddress(c.address)
      setCard({ ...c, address })
      setName(getContact(address)?.name ?? c.name)
      setSafety(safetyNumber(chatPubkeyOf(getChatKey()), c.pubkey))
      setScan(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid card')
    }
  }
  useEffect(() => { if (isCard(initial)) accept(initial) /* eslint-disable-next-line */ }, [])

  const [aName, setAName] = useState('')
  const [aAddr, setAAddr] = useState('')
  const [aPhone, setAPhone] = useState('')
  const [aErr, setAErr] = useState('')

  // Save by address only: no chat key needed, payments work. Chat starts once their card is added.
  function saveByAddress() {
    const a = aAddr.trim()
    if (!isAddress(a)) return setAErr('Enter a valid 0x wallet address')
    if (!aName.trim()) return setAErr('Give this contact a name')
    const address = getAddress(a)
    const existing = getContact(address)
    upsertContact({ ...existing, address, name: aName.trim(), addedAt: existing?.addedAt ?? Date.now(), phone: aPhone.trim() || undefined })
    onDone(address)
  }

  function save() {
    if (!card) return
    const existing = getContact(card.address)
    upsertContact({
      ...existing,
      address: card.address as Contact['address'], name: name.trim() || shortAddr(card.address), addedAt: existing?.addedAt ?? Date.now(),
      pubkey: card.pubkey, verified: existing?.pubkey === card.pubkey ? existing.verified : false, request: false,
    })
    onDone(card.address)
  }

  return (
    <Modal title="Add contact" onClose={onClose}>
      {card ? (
        <div className="stack">
          <div className="center-text stack" style={{ alignItems: 'center' }}>
            <Avatar seed={name || card.address} size={64} />
            <div className="mono dim" style={{ fontSize: 11, wordBreak: 'break-all' }}>{card.address}</div>
          </div>
          <Field label="Name" value={name} onChange={(e: any) => setName(e.target.value)} />
          <div className="banner ok" style={{ fontSize: 12 }}>
            <Icon name="shield" />
            <span>This card is signed by the wallet above, so the chat key really belongs to it. To be sure nobody swapped the card, compare this number with theirs:</span>
          </div>
          <div className="mono center-text" style={{ fontSize: 13 }}>{safety}</div>
          <div className="row" style={{ gap: 12 }}>
            <Button variant="ghost" onClick={() => setCard(null)}>Back</Button>
            <Button onClick={save}>Add contact</Button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {scan ? <QrScanner onResult={accept} /> : <Button variant="ghost" onClick={() => setScan(true)}>Scan their QR</Button>}
          <Field label="Or paste their card" mono value={text} onChange={(e: any) => { setText(e.target.value); setErr('') }} placeholder="mpc1:…" autoCapitalize="none" spellCheck={false} error={!!err} hint={err || undefined} />
          <Button onClick={() => accept(text)} disabled={!text.trim()}>Add</Button>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <p className="subtitle">Or save by wallet address (no chat yet)</p>
          <Field label="Name" value={aName} onChange={(e: any) => { setAName(e.target.value); setAErr('') }} />
          <Field label="Wallet address" mono value={aAddr} onChange={(e: any) => { setAAddr(e.target.value); setAErr('') }} placeholder="0x…" autoCapitalize="none" spellCheck={false} error={!!aErr} hint={aErr || undefined} />
          <Field label="Phone number (optional note)" value={aPhone} onChange={(e: any) => setAPhone(e.target.value)} inputMode="tel" hint="Only a label for you. Never used to find people or sent anywhere." />
          <Button variant="ghost" onClick={saveByAddress} disabled={!aName.trim() || !aAddr.trim()}>Save contact</Button>
        </div>
      )}
    </Modal>
  )
}

function MyCard({ onClose }: { onClose: () => void }) {
  const [card, setCard] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    getMyCard().then((c) => { setCard(c); setName(decodeCard(c).name) }).catch((e) => setErr(e instanceof Error ? e.message : 'Unlock first'))
  }, [])
  async function saveName() {
    try { setCard(await getMyCard(name)); toast('Name saved') } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
  }
  return (
    <Modal title="My card" onClose={onClose}>
      <div className="stack">
        <p className="subtitle">Let a friend scan this or send them the text. They can then message you and send you USDC.</p>
        {card ? <QrCode value={card} label="My contact card" ecl="L" /> : <span className="spinner" role="status" />}
        {err && <p className="error-text" role="alert">{err}</p>}
        <Field label="Name shown to contacts" value={name} onChange={(e: any) => setName(e.target.value)} maxLength={24} />
        <div className="row" style={{ gap: 12 }}>
          <Button variant="ghost" onClick={saveName} disabled={!card}>Save name</Button>
          <Button onClick={async () => { if (await copyPlain(card)) toast('Card copied') }} disabled={!card}>Copy card</Button>
        </div>
      </div>
    </Modal>
  )
}

export function ChatThread() {
  const { peer: rawPeer = '' } = useParams()
  const peer = isAddress(rawPeer) ? getAddress(rawPeer) : null
  const { messages, items } = useData()
  const { address } = useSession()
  const relay = useRelayStatus()
  const bal = useBalances(address)
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [payMode, setPayMode] = useState(false)
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [addCard, setAddCard] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const thread = peer ? messages.filter((m) => m.peer.toLowerCase() === peer.toLowerCase()) : []
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [thread.length])
  useEffect(() => { purgeChat() }, []) // thread opened: drop anything older than 24h

  if (!peer) return <div><ScreenHeader close to="/app/chat" /><div className="screen center"><p className="subtitle">Invalid contact address.</p></div></div>
  const contact = getContact(peer)
  const name = contact?.name ?? shortAddr(peer)
  const noKey = !contact?.pubkey

  async function send() {
    const body = text.trim()
    if (!body || !contact) return
    setErr('')
    setText('')
    try { await sendText(contact, body) } catch (e) { setText(body); setErr(e instanceof Error ? e.message : 'Not sent') }
  }

  async function sendPayment() {
    if (!peer) return
    setErr('')
    setSending(true)
    try {
      const units = parseUsdc(amount)
      const { item, code } = await createSignedPayment(peer, units, { spendable: bal.spendable })
      const shown = formatUsdc(units)
      try {
        if (!contact) throw new Error('Unknown contact')
        // The message carries the payment code so they can Accept it right in the thread.
        await sendPaymentMessage(contact, code, shown, item.id)
        toast('Payment sent in chat')
      } catch (e) {
        addMessage({ peer, dir: 'out', kind: 'payment', amount: shown, itemId: item.id })
        setErr((e instanceof Error ? e.message : 'Chat send failed') + ' The payment is signed: open it to share the code another way.')
      }
      setAmount(''); setPayMode(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign')
    } finally { setSending(false) }
  }

  async function accept(m: ChatMessage) {
    try { await acceptChatPayment(m); toast('Payment accepted. It settles when you are online.') } catch (e) { toast(e instanceof Error ? e.message : 'Cannot accept') }
  }

  function payLabel(m: ChatMessage): { accept?: boolean; text: string } {
    if (m.status === 'invalid') return { text: 'Not a payment the web wallet can accept for you' }
    const item = m.itemId ? items.find((i) => i.id === m.itemId) : undefined
    if (m.dir === 'in') return item ? { text: item.status === 'settled' ? 'Settled' : item.status === 'pending' ? 'Accepted, settles when you are online' : item.status } : { accept: true, text: '' }
    return { text: item ? (item.status === 'settled' ? 'Settled' : item.status === 'pending' ? 'Signed, waiting to settle' : item.status) : 'Signed' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="screen-head" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <button className="icon-btn" onClick={() => nav('/app/chat')} aria-label="Back"><Icon name="left" /></button>
        <div className="row grow" style={{ justifyContent: 'center' }}>
          <Avatar seed={name} size={34} />
          <div><div style={{ fontWeight: 600 }}>{name}</div><div className="mono dim" style={{ fontSize: 11 }}>{`${peer.slice(0, 8)}…${peer.slice(-6)}`}</div><div className="dim" style={{ fontSize: 10 }}>Messages disappear after 24 hours</div></div>
        </div>
        <span style={{ width: 40 }} />
      </div>
      {contact?.request && (
        <div className="banner" style={{ fontSize: 12, margin: '8px 16px' }}>
          <span>New contact. They sent you a signed card.</span>
          <button className="link" onClick={() => patchContact(peer, { request: false })}>Accept</button>
        </div>
      )}
      {noKey ? (
        <div className="banner" style={{ fontSize: 12, margin: '8px 16px' }}>
          <span>Add their card to chat. You can already send them USDC.</span>
          <button className="link" onClick={() => setAddCard(true)}>Add their card</button>
        </div>
      ) : relay.connected === 0 ? (
        <div className="banner" style={{ fontSize: 12, margin: '8px 16px' }}><span>No connection. Messages wait here and are sent when you are back online.</span></div>
      ) : null}
      <div className="thread grow" role="log" aria-live="polite">
        {thread.length === 0 && <p className="dim center-text">Say hi. You can send USDC right in the chat.</p>}
        {thread.map((m) => {
          if (m.kind === 'payment') {
            const l = payLabel(m)
            return (
              <div key={m.id} className={`paymsg ${m.dir}`}>
                <span className="ico" style={{ color: 'var(--accent)' }}><Icon name="cash" /></span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.dir === 'out' ? 'You sent' : 'Payment of'} {m.amount} USDC</div>
                  {l.accept ? <Button className="inline" style={{ minHeight: 36, padding: '6px 14px', fontSize: 14 }} onClick={() => accept(m)}>Accept</Button> : <div className="dim" style={{ fontSize: 12 }}>{l.text}</div>}
                  {m.dir === 'out' && m.status && STATUS_LABEL[m.status] && <div className="dim" style={{ fontSize: 11 }}>{STATUS_LABEL[m.status]}</div>}
                  {m.dir === 'out' && m.itemId && <Link to={`/app/payment/${encodeURIComponent(m.itemId)}`} style={{ fontSize: 11 }}>Share code another way</Link>}
                </div>
              </div>
            )
          }
          return (
            <div key={m.id} className={`bubble ${m.dir}`}>
              {m.body}
              {m.dir === 'out' && m.status && STATUS_LABEL[m.status] && <div style={{ fontSize: 10, opacity: 0.65, textAlign: 'right' }}>{STATUS_LABEL[m.status]}</div>}
            </div>
          )
        })}
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
        </div>
      )}
      {err && <p className="error-text" style={{ padding: '0 20px 8px' }} role="alert">{err}</p>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <button type="button" className={`round-btn alt ${payMode ? 'on' : ''}`} onClick={() => setPayMode((p) => !p)} aria-label="Send USDC" aria-pressed={payMode}><Icon name="cash" /></button>
        <textarea rows={1} value={text} disabled={noKey} placeholder="Message" maxLength={1000} aria-label="Message" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
        <button type="submit" className="round-btn" disabled={!text.trim() || noKey} aria-label="Send message"><Icon name="up" /></button>
      </form>
      {addCard && <AddContact initial="" onClose={() => setAddCard(false)} onDone={() => setAddCard(false)} />}
    </div>
  )
}
