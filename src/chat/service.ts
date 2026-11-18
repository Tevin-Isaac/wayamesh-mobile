import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { loadWallet } from '@/wallet/keystore';
import { getWallet, getTransactionByHash } from '@/db/queries';
import {
  addCarried, addMessage, purgeChat, MESSAGE_TTL_MS, getContact, getMeta, getQueuedOutgoing, getUnpublishedCarried, hasMessageId,
  markCarriedPublished, setMessageStatus, setMeta, upsertChatContact, type ChatMessage, type Contact,
} from '@/db/chat';
import { decodeEnvelope, encodeEnvelope } from '@/mesh/envelope';
import { ingestEnvelope, type IngestResult } from '@/mesh/ingest';
import { bleIsAvailable, relayTransaction, requestBlePermissions, scanForPeers } from '@/mesh/ble';
import {
  buildInner, buildRelayEvent, chatPubkeyOf, decodeMessageCode, encodeMessageCode, fromB64Url, openMessage,
  sealMessage, xonlyOf, type Content, type Inner,
} from './crypto';
import { getChatKey, getMyCard } from './identity';
import { DEFAULT_RELAYS, RelayPool } from './relay';

// Phone chat service: end-to-end encrypted messages over untrusted public Nostr relays.
// Honest limits: relays keep events only for a limited time and may drop them, so a message to someone who is
// offline is "delivered when they come online" at best. The relay subscription runs only while the app is active.

export const pool = new RelayPool();
const changeListeners = new Set<() => void>();

/** UI refresh hook: called whenever messages/contacts change. */
export function onChatChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => { changeListeners.delete(cb); };
}
function changed() { changeListeners.forEach((l) => l()); }

export function useRelayStatus() {
  return useSyncExternalStore(pool.subscribeStatus, pool.getStatus, pool.getStatus);
}

function myAddress(): string | null {
  return getWallet()?.address?.toLowerCase() ?? null;
}

/** Starts (or restarts) the relay subscription. Safe to call repeatedly. */
export async function startChat(): Promise<void> {
  purgeNow();
  const key = await getChatKey();
  const me = myAddress();
  if (!key || !me) return; // no wallet yet, or chat key not derived yet (derived at the first unlock)
  const now = Math.floor(Date.now() / 1000);
  const last = Number(getMeta('chat_since') ?? 0);
  const since = Math.max(last - 600, now - 86400);
  pool.start(DEFAULT_RELAYS, xonlyOf(chatPubkeyOf(key)), since, (e) => {
    void handleRelayContent(e.content).then((res) => {
      if (res !== 'invalid') setMeta('chat_since', String(Math.max(Number(getMeta('chat_since') ?? 0), e.created_at)));
    });
  });
  // Flush shortly after connections open, and again when connectivity changes.
  setTimeout(() => { void flushOutbox(); }, 3000);
}

/** Purge expired/overflow chat messages. Call on start, on foreground, every 5 min while active, and when a thread opens. */
export function purgeNow(): void {
  try { if (purgeChat() > 0) changed(); } catch { /* DB not ready */ }
}

export function stopChat() {
  pool.stop();
}

// ── sending ──────────────────────────────────────────────────────────────────

async function sendContent(contact: Contact, content: Content, extra: { amount?: string; txHash?: string; code?: string }): Promise<void> {
  let key = await getChatKey();
  const me = myAddress();
  let card = await getMyCard();
  if (!key || !card) {
    // Wallets created before chat existed: one unlock (biometric) derives the chat key and signs the card.
    await loadWallet();
    key = await getChatKey();
    card = await getMyCard();
    if (key && !pool.active) void startChat();
  }
  if (!key || !me) throw new Error('Chat is not set up yet. Unlock your wallet once to enable it.');
  if (!card) throw new Error('Your contact card is not ready yet. Open "My card" once.');
  if (!contact.pubkey) throw new Error('This contact has no chat key. Ask them to share their contact card.');
  const inner = buildInner(key, me, contact.address, content, card);
  const box = sealMessage(inner, contact.pubkey);
  const sealed = encodeMessageCode(contact.pubkey, box);
  addMessage({
    peer: contact.address, direction: 'out', kind: content.k === 'payment' ? 'payment' : 'text',
    body: content.x, amount: extra.amount, txHash: extra.txHash, code: extra.code,
    status: 'queued', msgId: inner.i, sealed, sentAt: inner.t * 1000,
  });
  changed();
  const ok = await publishSealed(sealed, contact.pubkey, inner.e);
  if (ok) { setMessageStatus(inner.i, 'sent', ['queued', 'handed']); changed(); }
  else void trySendNearby(); // experimental, see below
}

export async function sendText(contact: Contact, text: string): Promise<void> {
  await sendContent(contact, { k: 'text', x: text }, {});
}

/** Sends the payment code of an already-signed payment (the `transactions` row) as a chat message. */
export async function sendPaymentMessage(contact: Contact, txHash: string, amount: string, note?: string): Promise<void> {
  const row = getTransactionByHash(txHash);
  if (!row) throw new Error('Payment not found.');
  const code = encodeEnvelope(row.raw_signed);
  await sendContent(contact, { k: 'payment', a: amount, c: code, x: note }, { amount, txHash, code });
}

async function publishSealed(sealed: string, pubkey: string, expiresAt: number): Promise<boolean> {
  if (pool.getStatus().connected === 0) return false;
  const { box } = decodeMessageCode(sealed);
  return (await pool.publish(buildRelayEvent(xonlyOf(pubkey), box, expiresAt))) > 0;
}

let flushing = false;
/** Sends every queued message and any sealed messages this phone is carrying for others. Relay path only. */
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
        const exp = added_at + 86400;
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

export type BoxResult = 'delivered' | 'duplicate' | 'ack' | 'invalid' | 'dropped';

async function handleBox(box: Uint8Array): Promise<BoxResult> {
  const key = await getChatKey();
  const me = myAddress();
  if (!key || !me) return 'invalid';
  let inner: Inner;
  let card;
  try {
    ({ inner, card } = openMessage(box, key, me));
  } catch {
    return 'invalid'; // not for us, tampered, or forged
  }
  const peer = inner.f.toLowerCase();
  const known = getContact(peer);

  // Trust: a verified card (wallet signed the chat key) can add or update a contact. Without one, the sender's
  // chat key must match what we stored when we imported their card.
  if (card) {
    const rotated = !!known?.pubkey && known.pubkey !== card.pubkey;
    upsertChatContact({
      address: peer, name: card.name || `${peer.slice(0, 6)}…${peer.slice(-4)}`, pubkey: card.pubkey,
      request: known ? undefined : true, verified: rotated ? false : undefined,
    });
  } else if (!known?.pubkey || known.pubkey !== inner.p) {
    return 'dropped';
  }

  if (inner.k === 'ack') {
    if (inner.x) setMessageStatus(inner.x, 'delivered', ['queued', 'handed', 'sent']);
    changed();
    return 'ack';
  }
  if (hasMessageId(inner.i)) return 'duplicate';

  let status = 'received';
  let amount: string | undefined;
  let txHash: string | undefined;
  let code: string | undefined;
  if (inner.k === 'payment') {
    code = inner.c;
    try {
      if (!code) throw new Error('missing code');
      const env = decodeEnvelope(code);
      amount = env.amount;
      txHash = env.hash;
      if (env.to.toLowerCase() !== me || env.from.toLowerCase() !== peer) status = 'invalid';
    } catch {
      status = 'invalid';
    }
  }
  const added = addMessage({
    peer, direction: 'in', kind: inner.k === 'payment' ? 'payment' : 'text', body: inner.x, amount, txHash, code,
    status, msgId: inner.i, sentAt: inner.t * 1000,
  });
  purgeChat();
  changed();
  if (added) void sendAck(peer, inner.i);
  return added ? 'delivered' : 'duplicate';
}

async function sendAck(peer: string, id: string): Promise<void> {
  try {
    const c = getContact(peer);
    const key = await getChatKey();
    const me = myAddress();
    if (!c?.pubkey || !key || !me || pool.getStatus().connected === 0) return;
    const inner = buildInner(key, me, peer, { k: 'ack', x: id });
    await pool.publish(buildRelayEvent(xonlyOf(c.pubkey), sealMessage(inner, c.pubkey).slice(), inner.e));
  } catch { /* acks are best effort */ }
}

export async function handleRelayContent(content: string): Promise<BoxResult> {
  try {
    return await handleBox(fromB64Url(content));
  } catch {
    return 'invalid';
  }
}

/**
 * An offline message code (mpm1:) received over Bluetooth (EXPERIMENTAL, untested on devices). If it is addressed to this
 * phone's chat key it is opened; otherwise it is kept and published to relays when this phone is next online.
 */
export async function ingestMessageCode(code: string): Promise<'delivered' | 'duplicate' | 'carried' | 'invalid'> {
  try {
    const { recipientX, box } = decodeMessageCode(code);
    const key = await getChatKey();
    if (key && recipientX === xonlyOf(chatPubkeyOf(key))) {
      const r = await handleBox(box);
      return r === 'delivered' || r === 'duplicate' ? r : r === 'ack' ? 'delivered' : 'invalid';
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
  | { state: 'pending-accept' }                 // received, not accepted yet
  | { state: 'invalid' }
  | { state: 'held' | 'settled' | 'failed' | 'waiting'; label: string };

/** Live state of the payment behind a bubble, from the transactions table (single source of truth). */
export function paymentView(m: ChatMessage): PaymentView {
  if (m.status === 'invalid') return { state: 'invalid' };
  const row = m.tx_hash ? getTransactionByHash(m.tx_hash) : null;
  if (m.direction === 'in') {
    if (!row) return { state: 'pending-accept' };
    if (row.status === 'settled') return { state: 'settled', label: 'Settled' };
    if (row.status === 'failed') return { state: 'failed', label: 'Settlement failed' };
    return { state: 'held', label: 'Accepted, settles when you are online' };
  }
  if (!row) return { state: 'waiting', label: 'Signed' };
  if (row.status === 'settled') return { state: 'settled', label: 'Settled' };
  if (row.status === 'failed') return { state: 'failed', label: 'Failed' };
  return { state: 'waiting', label: 'Signed, waiting to settle' };
}

/** Accept a payment from a chat bubble. Same ingest path as scanning the code. */
export function acceptChatPayment(m: ChatMessage): IngestResult {
  if (!m.code) throw new Error('This message has no payment code.');
  const res = ingestEnvelope(m.code, myAddress(), 'qr');
  changed();
  return res;
}

// ── Bluetooth hand-off (EXPERIMENTAL, untested on devices) ───────────────────

let nearbyBusy = false;
/**
 * When offline, tries to hand queued sealed messages to a nearby Wayamesh phone over BLE using the existing
 * relayTransaction() framing (the payload starts with 'mpm1:'; the receiver's peripheral routes that prefix to chat).
 * The nearby phone may be the recipient or just a courier that publishes it later. Android only, needs a native
 * build and the other phone in "Receive" mode on the Mesh tab. Result is best effort and never changes payment paths.
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
