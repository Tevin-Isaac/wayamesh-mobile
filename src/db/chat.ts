import { getDb } from './schema';

// Chat + Contacts — a "money messenger": conversations tied to a wallet address,
// with inline USDC payments, stored locally in SQLite. Messages travel end-to-end
// encrypted over public Nostr relays (src/chat/service.ts); this file is storage only.
// Schema upgrades are additive ALTER TABLEs (try/catch) so existing rows survive.

function ensureTables(): void {
  if (migrated) return;
  getDb().execSync(`
    CREATE TABLE IF NOT EXISTS contacts (
      address    TEXT PRIMARY KEY,          -- lowercased wallet address
      name       TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      peer       TEXT NOT NULL,             -- contact address (thread key), lowercased
      direction  TEXT NOT NULL,             -- 'out' | 'in'
      kind       TEXT NOT NULL,             -- 'text' | 'payment'
      body       TEXT,                      -- text content
      amount     TEXT,                      -- USDC amount (payment)
      tx_hash    TEXT,                      -- payment tx hash
      status     TEXT,                      -- payment status
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_msg_peer ON chat_messages(peer);
    CREATE TABLE IF NOT EXISTS chat_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS chat_carried (
      code      TEXT PRIMARY KEY,           -- sealed message (mpm1:) for someone else, picked up over Bluetooth
      published INTEGER NOT NULL DEFAULT 0,
      added_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  const alters = [
    'ALTER TABLE contacts ADD COLUMN pubkey TEXT',                      // chat public key (from a verified card)
    'ALTER TABLE contacts ADD COLUMN verified INTEGER NOT NULL DEFAULT 0', // safety number compared in person
    'ALTER TABLE contacts ADD COLUMN request INTEGER NOT NULL DEFAULT 0',  // unknown sender, not yet accepted
    'ALTER TABLE contacts ADD COLUMN phone TEXT',                        // optional plain-text label, never used for lookup
    'ALTER TABLE chat_messages ADD COLUMN msg_id TEXT',                 // protocol message id (dedup + acks)
    'ALTER TABLE chat_messages ADD COLUMN code TEXT',                   // payment code carried by a payment message
    'ALTER TABLE chat_messages ADD COLUMN sealed TEXT',                 // outgoing sealed mpm1: code awaiting send
    'ALTER TABLE chat_messages ADD COLUMN sent_at INTEGER',             // ms timestamp
  ];
  for (const sql of alters) {
    try { getDb().execSync(sql); } catch { /* column already exists */ }
  }
  try { getDb().execSync('CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_msgid ON chat_messages(msg_id)'); } catch { /* ignore */ }
  migrated = true;
}
let migrated = false;

export interface Contact {
  address: string; name: string; created_at: number;
  pubkey: string | null; verified: number; request: number; phone: string | null;
}
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'received' | string;
export interface ChatMessage {
  id: number; peer: string; direction: 'out' | 'in'; kind: 'text' | 'payment';
  body: string | null; amount: string | null; tx_hash: string | null;
  status: string | null; created_at: number;
  msg_id: string | null; code: string | null; sealed: string | null; sent_at: number | null;
}

/** Saves a contact by address (no chat key needed; payments work). Keeps any chat key already stored. */
export function addContact(address: string, name: string, phone?: string): void {
  ensureTables();
  getDb().runSync(
    'INSERT INTO contacts (address, name, phone) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET name = excluded.name, phone = excluded.phone',
    [address.toLowerCase(), name.trim(), phone?.trim() || null],
  );
}

export function getContacts(): Contact[] {
  ensureTables();
  return getDb().getAllSync<Contact>('SELECT * FROM contacts ORDER BY name COLLATE NOCASE ASC');
}

export function getContact(address: string): Contact | null {
  ensureTables();
  return getDb().getFirstSync<Contact>('SELECT * FROM contacts WHERE address = ?', [address.toLowerCase()]);
}

export function addMessage(m: {
  peer: string; direction: 'out' | 'in'; kind: 'text' | 'payment';
  body?: string; amount?: string; txHash?: string; status?: string;
  msgId?: string; code?: string; sealed?: string; sentAt?: number;
}): boolean {
  ensureTables();
  // INSERT OR IGNORE: a repeated protocol message id (relay replays) is a no-op.
  const r = getDb().runSync(
    'INSERT OR IGNORE INTO chat_messages (peer, direction, kind, body, amount, tx_hash, status, msg_id, code, sealed, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [m.peer.toLowerCase(), m.direction, m.kind, m.body ?? null, m.amount ?? null, m.txHash ?? null, m.status ?? null,
      m.msgId ?? null, m.code ?? null, m.sealed ?? null, m.sentAt ?? null],
  );
  return r.changes > 0;
}

export function hasMessageId(msgId: string): boolean {
  ensureTables();
  return !!getDb().getFirstSync('SELECT 1 FROM chat_messages WHERE msg_id = ?', [msgId]);
}

/** Updates an outgoing message's delivery state. `onlyFrom` guards against downgrades (e.g. delivered -> sent). */
export function setMessageStatus(msgId: string, status: string, onlyFrom?: string[]): void {
  ensureTables();
  const clear = status === 'sent' || status === 'delivered' ? ', sealed = NULL' : '';
  const guard = onlyFrom ? ` AND status IN (${onlyFrom.map(() => '?').join(',')})` : '';
  getDb().runSync(
    `UPDATE chat_messages SET status = ?${clear} WHERE msg_id = ? AND direction = 'out'${guard}`,
    [status, msgId, ...(onlyFrom ?? [])],
  );
}

/** Outgoing messages still waiting for a relay connection (or a Bluetooth neighbour). */
export function getQueuedOutgoing(): ChatMessage[] {
  ensureTables();
  return getDb().getAllSync<ChatMessage>("SELECT * FROM chat_messages WHERE direction = 'out' AND status IN ('queued','handed') AND sealed IS NOT NULL ORDER BY id ASC");
}

// ── contacts with chat keys ──────────────────────────────────────────────────

export function upsertChatContact(c: { address: string; name: string; pubkey: string; request?: boolean; verified?: boolean }): void {
  ensureTables();
  const addr = c.address.toLowerCase();
  const existing = getContact(addr);
  if (!existing) {
    getDb().runSync(
      'INSERT INTO contacts (address, name, pubkey, verified, request) VALUES (?, ?, ?, ?, ?)',
      [addr, c.name, c.pubkey, c.verified ? 1 : 0, c.request ? 1 : 0],
    );
    return;
  }
  const keyChanged = !!existing.pubkey && existing.pubkey !== c.pubkey;
  getDb().runSync(
    'UPDATE contacts SET pubkey = ?, verified = ?, request = ?, name = ? WHERE address = ?',
    [c.pubkey, keyChanged ? 0 : (c.verified ?? !!existing.verified) ? 1 : 0, c.request === undefined ? existing.request : (c.request ? 1 : 0),
      existing.name && !existing.name.startsWith('0x') ? existing.name : c.name, addr],
  );
}

export function acceptRequest(address: string): void {
  ensureTables();
  getDb().runSync('UPDATE contacts SET request = 0 WHERE address = ?', [address.toLowerCase()]);
}

export function renameContact(address: string, name: string): void {
  ensureTables();
  getDb().runSync('UPDATE contacts SET name = ? WHERE address = ?', [name.trim(), address.toLowerCase()]);
}

export function setVerified(address: string, verified: boolean): void {
  ensureTables();
  getDb().runSync('UPDATE contacts SET verified = ? WHERE address = ?', [verified ? 1 : 0, address.toLowerCase()]);
}

export function getContactByPubX(x: string): Contact | null {
  ensureTables();
  return getDb().getFirstSync<Contact>('SELECT * FROM contacts WHERE substr(pubkey, 3) = ?', [x]);
}

// ── meta + carried messages ──────────────────────────────────────────────────

export function getMeta(key: string): string | null {
  ensureTables();
  return getDb().getFirstSync<{ value: string }>('SELECT value FROM chat_meta WHERE key = ?', [key])?.value ?? null;
}
export function setMeta(key: string, value: string): void {
  ensureTables();
  getDb().runSync('INSERT OR REPLACE INTO chat_meta (key, value) VALUES (?, ?)', [key, value]);
}

/** Sealed messages for other people picked up over Bluetooth; published to relays when this phone is online. */
export function addCarried(code: string): boolean {
  ensureTables();
  return getDb().runSync('INSERT OR IGNORE INTO chat_carried (code) VALUES (?)', [code]).changes > 0;
}
export function getUnpublishedCarried(): { code: string; added_at: number }[] {
  ensureTables();
  return getDb().getAllSync<{ code: string; added_at: number }>('SELECT code, added_at FROM chat_carried WHERE published = 0');
}
export function markCarriedPublished(code: string): void {
  ensureTables();
  getDb().runSync('UPDATE chat_carried SET published = 1 WHERE code = ?', [code]);
}

/** True if a payment bubble for this tx hash already exists (sync dedup). */
export function hasPaymentMessage(txHash: string): boolean {
  ensureTables();
  return !!getDb().getFirstSync<{ id: number }>(
    'SELECT id FROM chat_messages WHERE tx_hash = ? LIMIT 1', [txHash],
  );
}

export function getMessages(peer: string): ChatMessage[] {
  ensureTables();
  return getDb().getAllSync<ChatMessage>(
    'SELECT * FROM chat_messages WHERE peer = ? ORDER BY id ASC',
    [peer.toLowerCase()],
  );
}

export interface Conversation extends Contact {
  lastBody: string | null;
  lastStatus: string | null;
  lastDir: string | null;
  lastKind: string | null;
  lastAmount: string | null;
  lastAt: number | null;
}

/** Contacts with their most recent message, newest conversation first. */
export function getConversations(): Conversation[] {
  ensureTables();
  return getDb().getAllSync<Conversation>(`
    SELECT c.address, c.name, c.created_at, c.pubkey, c.verified, c.request, c.phone,
           m.status AS lastStatus,
           m.direction AS lastDir,
           m.body   AS lastBody,
           m.kind   AS lastKind,
           m.amount AS lastAmount,
           m.created_at AS lastAt
    FROM contacts c
    LEFT JOIN chat_messages m ON m.id = (
      SELECT id FROM chat_messages WHERE peer = c.address ORDER BY id DESC LIMIT 1
    )
    ORDER BY COALESCE(m.created_at, c.created_at) DESC
  `);
}

// ── retention: messages self-delete after 24 hours; storage is capped ────────

export const MESSAGE_TTL_MS = 24 * 3600 * 1000;
export const MAX_MESSAGES_PER_THREAD = 200;
export const MAX_MESSAGES_TOTAL = 1000;

/**
 * Deletes chat messages older than 24h, then trims each thread to 200 and the whole table to 1000 (oldest first).
 * Touches ONLY chat_messages: contacts, transactions/vouchers and their settlement status, and carried-message
 * bookkeeping are left alone. Payment bubbles disappear with the chat; the payment stays in History.
 */
export function purgeChat(nowMs = Date.now()): number {
  ensureTables();
  const db = getDb();
  let n = db.runSync(
    'DELETE FROM chat_messages WHERE COALESCE(sent_at, created_at * 1000) < ?', [nowMs - MESSAGE_TTL_MS],
  ).changes;
  n += db.runSync(
    `DELETE FROM chat_messages WHERE id IN (
       SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY peer ORDER BY id DESC) AS rn FROM chat_messages) WHERE rn > ?)`,
    [MAX_MESSAGES_PER_THREAD],
  ).changes;
  n += db.runSync(
    'DELETE FROM chat_messages WHERE id NOT IN (SELECT id FROM chat_messages ORDER BY id DESC LIMIT ?)', [MAX_MESSAGES_TOTAL],
  ).changes;
  return n;
}
