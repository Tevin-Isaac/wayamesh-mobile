import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('wayamesh.db');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const database = getDb();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS wallets (
      address TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      hash TEXT PRIMARY KEY,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      settled_at INTEGER,
      arc_tx_hash TEXT,
      raw_signed TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_address);
    CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);

    CREATE TABLE IF NOT EXISTS mesh_relays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      relayed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (tx_hash) REFERENCES transactions(hash)
    );

    CREATE INDEX IF NOT EXISTS idx_relay_tx ON mesh_relays(tx_hash);

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_block_synced INTEGER NOT NULL DEFAULT 0,
      last_sync_time INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO sync_log (id, last_block_synced, last_sync_time) VALUES (1, 0, 0);

    CREATE TABLE IF NOT EXISTS nonce_cache (
      address TEXT PRIMARY KEY,
      local_nonce INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pin_security (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO pin_security (id, attempt_count, locked_until)
    VALUES (1, 0, 0);

    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      biometric_enabled INTEGER NOT NULL DEFAULT 1,
      auto_settle_enabled INTEGER NOT NULL DEFAULT 1,
      language TEXT NOT NULL DEFAULT 'en'
    );

    INSERT OR IGNORE INTO preferences (id, biometric_enabled, auto_settle_enabled, language)
    VALUES (1, 1, 1, 'en');
  `);

  // v2: transactions can be plain signed transfers ('transfer') or MeshPayV2
  // vouchers ('voucher'). For vouchers, raw_signed holds the `mp2:` code.
  try {
    await database.execAsync("ALTER TABLE transactions ADD COLUMN kind TEXT NOT NULL DEFAULT 'transfer'");
  } catch { /* column already exists */ }
}
