import { getDb } from '@/db/schema';

// Last known wallet balance, so an offline phone can say "last known $X" instead of inventing a number.
// The value is the exact decimal string read from chain.

function ensure(): void {
  getDb().execSync('CREATE TABLE IF NOT EXISTS balance_cache (address TEXT PRIMARY KEY, amount TEXT NOT NULL, updated_at INTEGER NOT NULL)');
}

export function getCachedBalance(address: string): { amount: string; updatedAt: number } | null {
  try {
    ensure();
    const r = getDb().getFirstSync<{ amount: string; updated_at: number }>('SELECT amount, updated_at FROM balance_cache WHERE address = ?', [address.toLowerCase()]);
    return r ? { amount: r.amount, updatedAt: r.updated_at } : null;
  } catch { return null; }
}

export function setCachedBalance(address: string, amount: string): void {
  try {
    ensure();
    getDb().runSync('INSERT OR REPLACE INTO balance_cache (address, amount, updated_at) VALUES (?, ?, ?)', [address.toLowerCase(), amount, Math.floor(Date.now() / 1000)]);
  } catch { /* best effort */ }
}
