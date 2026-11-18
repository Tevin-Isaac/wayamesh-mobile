/**
 * Web chat service: end-to-end encrypted messages over untrusted public Nostr relays. Same wire format as the phone
 * (see crypto.ts). Honest limits: relays hold events only for a limited time, so a message to someone offline is
 * "delivered when they come online" at best. The subscription runs only while this tab is open and the wallet unlocked.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { getAddress, type Address } from 'viem'
import { getAccount, getChatKey, useSession } from '../session'
import { MESSAGE_TTL_MS, getData, getContact, purgeChat, patchContact, patchMessage, putMessage, setChatMeta, upsertContact, type ChatMessage, type Contact } from '../store'
import { inspectVoucher, ingestVoucher } from '../ingest'
import { voucherId } from '../mesh'
import {
  buildCard, buildInner, buildRelayEvent, chatPubkeyOf, decodeCard, decodeMessageCode, encodeMessageCode, fromB64Url, openMessage,
  renameCard, sealMessage, xonlyOf, type Content, type Inner,
} from './crypto'
import { DEFAULT_RELAYS, RelayPool } from './relay'

export const pool = new RelayPool()

export function useRelayStatus() {
  return useSyncExternalStore(pool.subscribeStatus, pool.getStatus, pool.getStatus)
}

/** The signed contact card, created on first use (signing is local, no prompt) and cached in the wallet-scoped store. */
export async function getMyCard(name?: string): Promise<string> {
  const account = getAccount()
  let card = getData().chat.card
  if (!card) {
    card = await buildCard({ address: account.address, signMessage: (m) => account.signMessage({ message: m }) }, chatPubkeyOf(getChatKey()), name ?? '')
    setChatMeta({ card })
  }
  if (name !== undefined && decodeCard(card).name !== name.trim()) {
    card = renameCard(card, name.trim())
    setChatMeta({ card })
  }
  return card
}

export function startChat() {
  purgeChat()
  if (pool.active) return
  let key: string
  try {
    key = getChatKey()
  } catch {
    return
  }
  const now = Math.floor(Date.now() / 1000)
  const since = Math.max((getData().chat.since ?? 0) - 600, now - 86400)
  pool.start(DEFAULT_RELAYS, xonlyOf(chatPubkeyOf(key)), since, (e) => {
    void handleRelayContent(e.content).then((res) => {
      if (res !== 'invalid') setChatMeta({ since: Math.max(getData().chat.since ?? 0, e.created_at) })
    })
  })
  setTimeout(() => void flushOutbox(), 3000)
}

export function stopChat() {
  pool.stop()
}

/** Mount once inside the unlocked app shell: runs the relay subscription while the wallet is unlocked. */
export function useChatRelay() {
  const { status } = useSession()
  useEffect(() => {
    if (status !== 'unlocked') return
    startChat()
    const timer = setInterval(() => void flushOutbox(), 30_000)
    const purgeTimer = setInterval(() => purgeChat(), 5 * 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') { purgeChat(); startChat() }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer)
      clearInterval(purgeTimer)
      document.removeEventListener('visibilitychange', onVis)
      stopChat()
    }
  }, [status])
}

async function publishSealed(sealed: string, pubkey: string, expiresAt: number): Promise<boolean> {
  if (pool.getStatus().connected === 0) return false
  const { box } = decodeMessageCode(sealed)
  return (await pool.publish(buildRelayEvent(xonlyOf(pubkey), box, expiresAt))) > 0
}

async function sendContent(contact: Contact, content: Content, extra: { amount?: string; itemId?: string; code?: string }): Promise<void> {
  if (!contact.pubkey) throw new Error('This contact has no chat key. Ask them to share their contact card.')
  const account = getAccount()
  const card = await getMyCard()
  const inner = buildInner(getChatKey(), account.address, contact.address, content, card)
  const sealed = encodeMessageCode(contact.pubkey, sealMessage(inner, contact.pubkey))
  putMessage({
    peer: contact.address, dir: 'out', kind: content.k === 'payment' ? 'payment' : 'text', body: content.x, amount: extra.amount,
    itemId: extra.itemId, code: extra.code, ts: inner.t * 1000, mid: inner.i, status: 'queued', sealed,
  })
  if (await publishSealed(sealed, contact.pubkey, inner.e)) patchMessage(inner.i, { status: 'sent', sealed: undefined })
}

export const sendText = (contact: Contact, text: string) => sendContent(contact, { k: 'text', x: text }, {})

/** Sends the payment code (mp2: voucher) of an already-signed payment as a chat message. */
export const sendPaymentMessage = (contact: Contact, code: string, amount: string, itemId: string) =>
  sendContent(contact, { k: 'payment', a: amount, c: code }, { amount, itemId, code })

let flushing = false
export async function flushOutbox(): Promise<void> {
  if (flushing || pool.getStatus().connected === 0) return
  flushing = true
  try {
    for (const m of getData().messages.filter((x) => x.dir === 'out' && x.status === 'queued' && x.sealed && x.mid)) {
      const c = getContact(m.peer)
      // Never republish an expired message.
      if (m.ts + MESSAGE_TTL_MS <= Date.now()) continue
      if (c?.pubkey && (await publishSealed(m.sealed as string, c.pubkey, Math.floor((m.ts + MESSAGE_TTL_MS) / 1000)))) patchMessage(m.mid as string, { status: 'sent', sealed: undefined })
    }
  } finally {
    flushing = false
  }
}

export type BoxResult = 'delivered' | 'duplicate' | 'ack' | 'invalid' | 'dropped'

async function handleBox(box: Uint8Array): Promise<BoxResult> {
  const me = getAccount().address.toLowerCase()
  let inner: Inner
  let card
  try {
    ;({ inner, card } = openMessage(box, getChatKey(), me))
  } catch {
    return 'invalid'
  }
  const peer = getAddress(inner.f) as Address
  const known = getContact(peer)
  if (card) {
    const rotated = !!known?.pubkey && known.pubkey !== card.pubkey
    if (known) patchContact(peer, { pubkey: card.pubkey, ...(rotated ? { verified: false } : {}) })
    else upsertContact({ address: peer, name: card.name || `${peer.slice(0, 6)}…${peer.slice(-4)}`, addedAt: Date.now(), pubkey: card.pubkey, request: true })
  } else if (!known?.pubkey || known.pubkey !== inner.p) {
    return 'dropped'
  }
  if (inner.k === 'ack') {
    if (inner.x) {
      const m = getData().messages.find((x) => x.mid === inner.x && x.dir === 'out')
      if (m && m.status !== 'delivered') patchMessage(inner.x, { status: 'delivered', sealed: undefined })
    }
    return 'ack'
  }
  let status: ChatMessage['status'] = 'received'
  let itemId: string | undefined
  let amount: string | undefined
  if (inner.k === 'payment') {
    try {
      if (!inner.c) throw new Error('missing code')
      const { voucher, problem } = await inspectVoucher(inner.c)
      itemId = voucherId(voucher.payment)
      amount = inner.a
      if (problem || voucher.payment.to.toLowerCase() !== me || voucher.payment.from.toLowerCase() !== peer.toLowerCase()) status = 'invalid'
    } catch {
      status = 'invalid' // e.g. a phone direct-transfer envelope, which the web wallet cannot accept
    }
  }
  const added = putMessage({
    peer, dir: 'in', kind: inner.k === 'payment' ? 'payment' : 'text', body: inner.x, amount, itemId, code: inner.c,
    ts: inner.t * 1000, mid: inner.i, status,
  })
  if (added) void sendAck(peer, inner.i)
  return added ? 'delivered' : 'duplicate'
}

async function sendAck(peer: Address, id: string) {
  try {
    const c = getContact(peer)
    if (!c?.pubkey || pool.getStatus().connected === 0) return
    const inner = buildInner(getChatKey(), getAccount().address, peer, { k: 'ack', x: id })
    await pool.publish(buildRelayEvent(xonlyOf(c.pubkey), sealMessage(inner, c.pubkey), inner.e))
  } catch {
    /* best effort */
  }
}

export async function handleRelayContent(content: string): Promise<BoxResult> {
  try {
    return await handleBox(fromB64Url(content))
  } catch {
    return 'invalid'
  }
}

/** Accept a payment from a chat bubble: same path as pasting or scanning the code. */
export async function acceptChatPayment(m: ChatMessage): Promise<void> {
  if (!m.code) throw new Error('This message has no payment code.')
  await ingestVoucher(m.code)
}
