import { getDb } from '@/db/schema';
import { withRpc } from './rpc';

function ensureTable(): void {
  getDb().runSync(`
    CREATE TABLE IF NOT EXISTS nonce_cache (
      address TEXT PRIMARY KEY,
      local_nonce INTEGER NOT NULL DEFAULT 0
    )
  `);
}

export function getLocalNonce(address: string): number {
  ensureTable();
  const row = getDb().getFirstSync<{ local_nonce: number }>(
    'SELECT local_nonce FROM nonce_cache WHERE address = ?',
    [address.toLowerCase()],
  );
  return row?.local_nonce ?? 0;
}

export function setLocalNonce(address: string, nonce: number): void {
  ensureTable();
  getDb().runSync(
    'INSERT OR REPLACE INTO nonce_cache (address, local_nonce) VALUES (?, ?)',
    [address.toLowerCase(), nonce],
  );
}

/**
 * Return the nonce to use for the next transaction.
 * When online: reconciles chain nonce with local nonce (takes the max).
 * When offline: returns the locally-tracked nonce.
 */
export async function getEffectiveNonce(address: string): Promise<number> {
  try {
    const chainNonce = await withRpc(p => p.getTransactionCount(address, 'latest'));
    const localNonce = getLocalNonce(address);
    const effective = Math.max(chainNonce, localNonce);
    if (chainNonce > localNonce) {
      setLocalNonce(address, chainNonce);
    }
    return effective;
  } catch {
    return getLocalNonce(address);
  }
}

export function resetNonce(address: string): void {
  setLocalNonce(address, 0);
}
