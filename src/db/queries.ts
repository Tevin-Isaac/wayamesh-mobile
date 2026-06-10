import { getDb } from './schema';

export type TxStatus = 'pending' | 'relayed' | 'settled' | 'failed';

export interface WalletRow {
  address: string;
  public_key: string;
  encrypted_key: string;
  created_at: number;
}

export interface TransactionRow {
  hash: string;
  from_address: string;
  to_address: string;
  amount: string;
  status: TxStatus;
  created_at: number;
  settled_at: number | null;
  arc_tx_hash: string | null;
  raw_signed: string;
}

export interface MeshRelayRow {
  id: number;
  tx_hash: string;
  peer_id: string;
  relayed_at: number;
}

// Wallet queries
export function saveWallet(wallet: Omit<WalletRow, 'created_at'>): void {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO wallets (address, public_key, encrypted_key) VALUES (?, ?, ?)',
    [wallet.address, wallet.public_key, wallet.encrypted_key],
  );
}

export function getWallet(): WalletRow | null {
  const db = getDb();
  return db.getFirstSync<WalletRow>('SELECT * FROM wallets LIMIT 1');
}

export function clearWalletData(): void {
  const db = getDb();
  db.runSync('DELETE FROM wallets');
  db.runSync('DELETE FROM transactions');
  db.runSync('DELETE FROM mesh_relays');
  db.runSync('UPDATE sync_log SET last_block_synced = 0, last_sync_time = 0 WHERE id = 1');
}

// Transaction queries
export function saveTransaction(tx: Omit<TransactionRow, 'created_at' | 'settled_at' | 'arc_tx_hash'>): void {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO transactions (hash, from_address, to_address, amount, status, raw_signed) VALUES (?, ?, ?, ?, ?, ?)',
    [tx.hash, tx.from_address, tx.to_address, tx.amount, tx.status, tx.raw_signed],
  );
}

export function getTransactions(limit = 50): TransactionRow[] {
  const db = getDb();
  return db.getAllSync<TransactionRow>(
    'SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?',
    [limit],
  );
}

export function getPendingTransactions(): TransactionRow[] {
  const db = getDb();
  return db.getAllSync<TransactionRow>(
    "SELECT * FROM transactions WHERE status IN ('pending', 'relayed') ORDER BY created_at ASC",
  );
}

export function updateTransactionStatus(
  hash: string,
  status: TxStatus,
  arcTxHash?: string,
): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.runSync(
    'UPDATE transactions SET status = ?, arc_tx_hash = ?, settled_at = ? WHERE hash = ?',
    [status, arcTxHash ?? null, status === 'settled' ? now : null, hash],
  );
}

// Mesh relay queries
export function logMeshRelay(txHash: string, peerId: string): void {
  const db = getDb();
  db.runSync(
    'INSERT INTO mesh_relays (tx_hash, peer_id) VALUES (?, ?)',
    [txHash, peerId],
  );
}

// Sync log queries
export function getSyncLog(): { lastBlockSynced: number; lastSyncTime: number } {
  const db = getDb();
  const row = db.getFirstSync<{ last_block_synced: number; last_sync_time: number }>(
    'SELECT last_block_synced, last_sync_time FROM sync_log WHERE id = 1',
  );
  return {
    lastBlockSynced: row?.last_block_synced ?? 0,
    lastSyncTime: row?.last_sync_time ?? 0,
  };
}

export function updateSyncLog(lastBlock: number): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.runSync(
    'UPDATE sync_log SET last_block_synced = ?, last_sync_time = ? WHERE id = 1',
    [lastBlock, now],
  );
}
