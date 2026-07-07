import { getDb } from './schema';

// Chat + Contacts — a "money messenger": conversations tied to a wallet address,
// with inline USDC payments. Stored locally in SQLite. Message delivery across
// devices rides the same transport as payments (BLE mesh / relay) — see the
// transport note in the chat screens; today the thread is device-local + on-chain
// payment records, which is enough for a full single-device demo.

function ensureTables(): void {
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
  `);
}

export interface Contact { address: string; name: string; created_at: number }
export interface ChatMessage {
  id: number; peer: string; direction: 'out' | 'in'; kind: 'text' | 'payment';
  body: string | null; amount: string | null; tx_hash: string | null;
  status: string | null; created_at: number;
}

export function addContact(address: string, name: string): void {
  ensureTables();
  getDb().runSync(
    'INSERT OR REPLACE INTO contacts (address, name) VALUES (?, ?)',
    [address.toLowerCase(), name.trim()],
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
}): void {
  ensureTables();
  getDb().runSync(
    'INSERT INTO chat_messages (peer, direction, kind, body, amount, tx_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [m.peer.toLowerCase(), m.direction, m.kind, m.body ?? null, m.amount ?? null, m.txHash ?? null, m.status ?? null],
  );
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
  lastKind: string | null;
  lastAmount: string | null;
  lastAt: number | null;
}

/** Contacts with their most recent message, newest conversation first. */
export function getConversations(): Conversation[] {
  ensureTables();
  return getDb().getAllSync<Conversation>(`
    SELECT c.address, c.name, c.created_at,
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
