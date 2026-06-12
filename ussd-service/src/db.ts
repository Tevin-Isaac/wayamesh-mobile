import Database from 'better-sqlite3';

// SCAFFOLD NOTE: SQLite is fine for development and a single-node pilot. For
// production with real money, move to Postgres with row-level locking and run
// the ledger transfers inside SQL transactions (already done below) on a managed,
// backed-up instance.

export const db = new Database('wayamesh-ussd.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone         TEXT PRIMARY KEY,
    address       TEXT NOT NULL,           -- custodial deposit address
    encrypted_key TEXT NOT NULL,           -- AES-256-GCM encrypted private key
    pin_hash      TEXT NOT NULL,
    balance       INTEGER NOT NULL DEFAULT 0,  -- ledger balance in USDC base units (6dp)
    pin_attempts  INTEGER NOT NULL DEFAULT 0,
    locked_until  INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- Append-only ledger. Every balance change is a row; balance column is the
  -- running cache. type: deposit | withdraw | transfer_in | transfer_out
  CREATE TABLE IF NOT EXISTS ledger_tx (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone         TEXT NOT NULL,
    type          TEXT NOT NULL,
    amount        INTEGER NOT NULL,        -- signed, base units
    counterparty  TEXT,                    -- phone or 0x address
    onchain_hash  TEXT,                    -- set for deposit/withdraw
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_phone ON ledger_tx(phone);
`);

export interface UserRow {
  phone: string;
  address: string;
  encrypted_key: string;
  pin_hash: string;
  balance: number;
  pin_attempts: number;
  locked_until: number;
  created_at: number;
}

export function getUser(phone: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined;
}

export function getUserByAddress(address: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE address = ? COLLATE NOCASE').get(address) as UserRow | undefined;
}
