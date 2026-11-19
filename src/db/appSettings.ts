import { getDb } from './schema';

// Small key/value settings table (accept limit, etc.). Created lazily like the chat tables.

let ready = false;
function ensure(): void {
  if (ready) return;
  getDb().execSync('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  ready = true;
}

export function getSetting(key: string): string | null {
  try {
    ensure();
    return getDb().getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key])?.value ?? null;
  } catch {
    return null;
  }
}

export function setSetting(key: string, value: string): void {
  ensure();
  getDb().runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value]);
}

/** Per-payer limit on unsettled offline value a receiver will hold on trust (USD). Default 100. 0 would mean unlimited, so it is not allowed. */
export const DEFAULT_ACCEPT_LIMIT = 100;
export function getAcceptLimit(): number {
  const n = Number(getSetting('accept_limit'));
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? n : DEFAULT_ACCEPT_LIMIT;
}
export function setAcceptLimit(n: number): void {
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) throw new Error('Enter an amount above zero.');
  setSetting('accept_limit', String(n));
}
