import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { getTransactionByHash } from '@/db/queries';
import {
  addCarried, addMessage, addInvoice, purgeChat, MESSAGE_TTL_MS, getContact, getMeta, getQueuedOutgoing, getUnpublishedCarried, hasMessageId,
  isBlocked, markCarriedPublished, setMessageStatus, setMeta, upsertChatContact, type ChatMessage, type Contact,
} from '@/db/chat';
import { ingestEnvelope } from '@/mesh/ingest';
import { randomRef } from '@/mesh/voucher';
import { bleIsAvailable, relayTransaction, requestBlePermissions, scanForPeers } from '@/mesh/ble';
import { safeDecimal } from '@/utils/safety';
import {
  buildInner, buildRelayEvent, decodeMessageCode, encodeMessageCode, fromB64Url, isWithinRetention, MAX_RELAY_CONTENT, openBox, packInner,
  sealBox, unpackInner, validPubkey, verifyInner, xonlyOf, MESSAGE_TTL_SECONDS, DEFAULT_RELAYS, cleanText, type Content, type Hex, type Inner,
} from './crypto';
import { getSession, unlockChat } from './identity';
import { RelayPool } from './relay';

// Phone chat service: end-to-end encrypted messages over untrusted public Nostr relays, wire-compatible with the Arc Studio
// web wallet. The chat key is the wallet key, held in memory for the app session only (see identity.ts): relays are
// subscribed only while the session is unlocked and the app is foregrounded.
// Messages self-delete after 24 hours (client policy + NIP-40 tag on relay events). Contacts and payments are never purged.

export const pool = new RelayPool();
const changeListeners = new Set<() => void>();

/** UI refresh hook: called whenever messages/contacts change. */
export function onChatChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => { changeListeners.delete(cb); };
}
function changed() { changeListeners.forEach((l) => { try { l(); } catch { /* a bad listener must not break chat */ } }); }

export function useRelayStatus() {
  return useSyncExternalStore(pool.subscribeStatus, pool.getStatus, pool.getStatus);
}

/** Starts (or restarts) the relay subscription. Needs the unlocked session; no-ops otherwise. */
export async function startChat(): Promise<void> {
  purgeNow();
  const s = getSession();
  if (!s) return;
  const now = Math.floor(Date.now() / 1000);
  const last = Math.min(Number(getMeta('chat_since') ?? 0) || 0, now);
  const since = Math.max(last - 600, now - MESSAGE_TTL_SECONDS);
  pool.start(DEFAULT_RELAYS, xonlyOf(s.pubkey), since, (e) => {
    void handleRelayContent(e.content).then((res) => {
      // The sync cursor moves only for real messages, and never past now.
      if (res === 'delivered' || res === 'duplicate') {
        const t = Math.min(e.created_at, Math.floor(Date.now() / 1000));
        if (t > (Number(getMeta('chat_since') ?? 0) || 0)) setMeta('chat_since', String(t));
      }
    }).catch(() => undefined);
  });
  setTimeout(() => { void flushOutbox(); }, 3000);
}

/** Purge expired/overflow chat messages (messages only). Call on start, on foreground, every 5 min while active, and when a thread opens. */
export function purgeNow(): void {
  try { if (purgeChat() > 0) changed(); } catch { /* DB not ready */ }
}

export function stopChat() {
  pool.stop();
}

// ── sending ──────────────────────────────────────────────────────────────────

async function sendContent(contact: Contact, content: Content, extra: { amount?: string; txHash?: string; code?: string; ref?: string }): Promise<void> {
  if (!(await unlockChat())) throw new Error('Chat is locked. Authenticate to unlock it.');
  const s = getSession();
  if (!s) throw new Error('Chat is locked. Authenticate to unlock it.');
  if (!contact.pubkey || !validPubkey(contact.pubkey)) throw new Error('This contact has no chat key. Ask them to share their contact card.');
  if (content.x !== undefined && content.x.length > 500) throw new Error('Messages are limited to 500 characters.');
  if (!pool.active) void startChat();
  const inner = await buildInner(s.signer, contact.address as `0x${string}`, content);
  const box = sealBox(packInner(inner), contact.pubkey as Hex);
  const sealed = encodeMessageCode(contact.pubkey as Hex, box);
  addMessage({
    peer: contact.address, direction: 'out', kind: content.k,
    body: content.x, amount: extra.amount ?? content.a, txHash: extra.txHash, code: extra.code, ref: extra.ref ?? content.r,
    verified: content.k === 'payment' ? true : undefined,
    status: 'queued', msgId: inner.i, sealed, sentAt: inner.t * 1000,
  });
  changed();
  const ok = await publishSealed(sealed, contact.pubkey, inner.t + MESSAGE_TTL_SECONDS);
  if (ok) { setMessageStatus(inner.i, 'sent', ['queued', 'handed']); changed(); }
  else void trySendNearby();
}

export async function sendText(contact: Contact, text: string): Promise<void> {
  await sendContent(contact, { k: 'text', x: text }, {});
}

/** Asks a contact for money: a 'request' message with amount and a fresh invoice reference. The invoice is marked paid only by a payment to me that covers it. */
export async function sendRequest(contact: Contact, amount: string, note?: string): Promise<void> {
  const a = safeDecimal(amount);
  if (!a || Number(a) <= 0) throw new Error('Enter a valid amount.');
  const ref = randomRef() as Hex;
  await sendContent(contact, { k: 'request', a, r: ref, ...(note ? { x: note.slice(0, 500) } : {}) }, { amount: a, ref });
  addInvoice(ref, contact.address, a);
}

/** Sends the payment code of an already-signed voucher (the `transactions` row) as a chat message. */
export async function sendPaymentMessage(contact: Contact, txHash: string, amount: string, note?: string): Promise<void> {
  const row = getTransactionByHash(txHash);
  if (!row || row.kind !== 'voucher') throw new Error('Only offline-reserve payments (mp2 vouchers) can travel in chat.');
  await sendContent(contact, { k: 'payment', a: amount, c: row.raw_signed, ...(note ? { x: note.slice(0, 500) } : {}) }, { amount, txHash, code: row.raw_signed });
}

async function publishSealed(sealed: string, pubkey: string, expiresAt: number): Promise<boolean> {
  if (pool.getStatus().connected === 0) return false;
  const { box } = decodeMessageCode(sealed);
  return (await pool.publish(buildRelayEvent(xonlyOf(pubkey), box, expiresAt))) > 0;
}

let flushing = false;
/** Sends everything waiting: queued messages and sealed messages this phone is carrying for others. Relay path only. */
export async function flushOutbox(): Promise<void> {
  if (flushing || pool.getStatus().connected === 0) return;
  flushing = true;
  try {
    for (const m of getQueuedOutgoing()) {
      const c = getContact(m.peer);
      if (!c?.pubkey || !m.sealed || !m.msg_id) continue;
      // Never republish an expired message.
      if ((m.sent_at ?? 0) + MESSAGE_TTL_MS <= Date.now()) continue;
      if (await publishSealed(m.sealed, c.pubkey, Math.floor(((m.sent_at ?? Date.now()) + MESSAGE_TTL_MS) / 1000))) setMessageStatus(m.msg_id, 'sent', ['queued', 'handed']);
    }
    for (const { code, added_at } of getUnpublishedCarried()) {
      try {
        // Carried messages live at most 24h from pickup; after that they are never published.
        const exp = added_at + MESSAGE_TTL_SECONDS;
        if (exp <= Date.now() / 1000) { markCarriedPublished(code); continue; }
        const { recipientX, box } = decodeMessageCode(code);
        if ((await pool.publish(buildRelayEvent(recipientX, box, exp))) > 0) markCarriedPublished(code);
      } catch { markCarriedPublished(code); }
    }
  } finally {
    flushing = false;
    changed();
  }
}

// ── receiving ────────────────────────────────────────────────────────────────

export type BoxResult = 'delivered' | 'duplicate' | 'invalid' | 'dropped';

/** Opens a sealed box addressed to this wallet, checks the sender, and stores the message. Never throws. */
export async function handleBox(box: Uint8Array): Promise<BoxResult> {
  try {
    return await handleBoxUnsafe(box);
  } catch {
    return 'invalid'; // a malformed message can never crash the app
  }
}

async function handleBoxUnsafe(box: Uint8Array): Promise<BoxResult> {
  const s = getSession();
  if (!s) return 'invalid'; // chat locked: nothing can be opened
  let inner: Inner;
  let senderPub: Hex;
  try {
    inner = unpackInner(openBox(box, s.privateKey));
    senderPub = await verifyInner(inner, s.address);
  } catch {
    return 'invalid'; // not for us, tampered, or forged
  }
  // 24h policy: older than a day, or claiming to be from more than a day ahead, is dropped.
  if (!isWithinRetention(inner.t)) return 'dropped';
  const peer = inner.f.toLowerCase();
  if (peer === s.address.toLowerCase()) return 'invalid';
  if (isBlocked(peer)) return 'dropped';
  if (hasMessageId(inner.i)) return 'duplicate';

  const known = getContact(peer);
  if (!known) {
    // A stranger: keep them in message requests until the user accepts. The inbox has a cap so nobody can flood it.
    const ok = upsertChatContact({ address: peer, name: `${peer.slice(0, 6)}…${peer.slice(-4)}`, pubkey: senderPub, verified: false, request: true });
    if (!ok) return 'dropped';
  } else if (known.pubkey !== senderPub) {
    upsertChatContact({ address: peer, name: known.name, pubkey: senderPub, verified: false });
  }

  let status = 'received';
  let amount: string | undefined;
  let txHash: string | undefined;
  let code: string | undefined;
  let verified: boolean | undefined;
  let body: string | undefined = inner.x ? cleanText(inner.x, 500) : undefined;
  if (inner.k === 'payment') {
    // Never show the amount the sender claims: the amount comes from the verified voucher, and it counts as mine only if it pays me.
    code = inner.c;
    try {
      if (!code) throw new Error('This message has no payment code.');
      const res = ingestEnvelope(code, s.address, 'chat');
      amount = res.envelope.amount;
      txHash = res.envelope.hash;
      if (res.role === 'courier') {
        status = 'carried'; // not for me: held for settlement, with a clear warning in the bubble
        verified = false;
      } else {
        verified = res.envelope.from.toLowerCase() === peer;
      }
    } catch (e) {
      status = 'invalid';
      verified = false;
      body = e instanceof Error ? cleanText(e.message, 200) : 'Invalid payment';
    }
  } else if (inner.k === 'request') {
    amount = safeDecimal(inner.a) || undefined;
  }
  const added = addMessage({
    peer, direction: 'in', kind: inner.k, body, amount, txHash, code, ref: inner.r, verified,
    status, msgId: inner.i, sentAt: inner.t * 1000,
  });
  purgeChat();
  changed();
  return added ? 'delivered' : 'duplicate';
}

export async function handleRelayContent(content: string): Promise<BoxResult> {
  if (typeof content !== 'string' || content.length > MAX_RELAY_CONTENT) return 'invalid';
  try {
    return await handleBox(fromB64Url(content));
  } catch {
    return 'invalid';
  }
}

/**
 * An offline message code (mpm1:), by scan, paste or Bluetooth. If addressed to this wallet it is opened; otherwise it is kept
 * and published to relays when this phone is next online (the phone is a courier; only the recipient can read it).
 */
export async function ingestMessageCode(code: string): Promise<'delivered' | 'duplicate' | 'carried' | 'invalid'> {
  try {
    if (code.length > MAX_RELAY_CONTENT) return 'invalid';
    const { recipientX, box } = decodeMessageCode(code);
    const s = getSession();
    if (s && recipientX === xonlyOf(s.pubkey)) {
      const r = await handleBox(box);
      return r === 'delivered' || r === 'duplicate' ? r : 'invalid';
    }
    const added = addCarried(code.trim());
    if (added) void flushOutbox();
    return added ? 'carried' : 'duplicate';
  } catch {
    return 'invalid';
  }
}

// ── payments inside chat ─────────────────────────────────────────────────────

export type PaymentView =
  | { state: 'invalid'; reason: string }
  | { state: 'carried'; label: string }          // a payment for someone else that this phone holds
  | { state: 'held' | 'settled' | 'failed' | 'waiting'; label: string };

/** Live state of the payment behind a bubble, from the transactions table (single source of truth). */
export function paymentView(m: ChatMessage): PaymentView {
  if (m.status === 'invalid') return { state: 'invalid', reason: m.body ?? 'Not a valid payment' };
  if (m.status === 'carried') return { state: 'carried', label: 'This payment is not for you. Your phone is only carrying it.' };
  const row = m.tx_hash ? getTransactionByHash(m.tx_hash) : null;
  if (m.direction === 'in') {
    if (!row) return { state: 'invalid', reason: 'Payment no longer stored' };
    if (row.status === 'settled') return { state: 'settled', label: 'Settled' };
    if (row.status === 'failed') return { state: 'failed', label: 'Settlement failed' };
    return { state: 'held', label: m.verified ? 'Received, settles when you are online' : 'Received, but not from this contact. Check before relying on it.' };
  }
  if (!row) return { state: 'waiting', label: 'Signed' };
  if (row.status === 'settled') return { state: 'settled', label: 'Settled' };
  if (row.status === 'failed') return { state: 'failed', label: 'Failed' };
  return { state: 'waiting', label: 'Signed, waiting to settle' };
}

// ── Bluetooth hand-off (Android only, EXPERIMENTAL, untested on devices) ─────

let nearbyBusy = false;
/**
 * When offline, tries to hand queued sealed messages to a nearby Wayamesh phone over BLE. Android only (the native peripheral
 * module has no iOS implementation); on iOS this does nothing and the user relies on QR or text hand-off.
 */
export async function trySendNearby(): Promise<number> {
  if (nearbyBusy || Platform.OS !== 'android' || !bleIsAvailable()) return 0;
  const queued = getQueuedOutgoing().filter((m) => m.status === 'queued' && m.sealed && m.msg_id);
  if (queued.length === 0) return 0;
  nearbyBusy = true;
  try {
    if (!(await requestBlePermissions())) return 0;
    const peerId = await new Promise<string | null>((resolve) => {
      let done = false;
      const stop = scanForPeers((d) => { if (!done) { done = true; stop(); resolve(d.id); } });
      setTimeout(() => { if (!done) { done = true; stop(); resolve(null); } }, 5000);
    });
    if (!peerId) return 0;
    let n = 0;
    for (const m of queued) {
      if (await relayTransaction(m.sealed as string, m.msg_id as string, peerId)) {
        setMessageStatus(m.msg_id as string, 'handed', ['queued']);
        n++;
      }
    }
    changed();
    return n;
  } catch {
    return 0;
  } finally {
    nearbyBusy = false;
  }
}
