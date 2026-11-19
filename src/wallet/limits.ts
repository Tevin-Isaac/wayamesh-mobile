import { getDb } from '@/db/schema';
import { getSetting, setSetting } from '@/db/appSettings';
import { formatUsdc, parseUsdc } from '@/mesh/voucher';

// Spending limits for manual payments (per payment and per rolling 24h), enforced on the device before anything is signed.
// Ported from the Arc Studio web wallet's policy.ts. Lowering a limit is free; RAISING one needs a fresh biometric check
// (see requireReauth in src/utils/reauth.ts, used by the Settings screen). A bad stored value falls back to the default
// instead of switching the limit off.

export const DEFAULT_PER_TX = '50';
export const DEFAULT_DAILY = '200';
const DAY = 24 * 3600;

function safeParse(value: string | null, fallback: string): bigint {
  try {
    if (value === null) return parseUsdc(fallback);
    const v = parseUsdc(value);
    return v >= 0n ? v : parseUsdc(fallback);
  } catch {
    return parseUsdc(fallback);
  }
}

export interface Limits { perTx: bigint; daily: bigint }

export function getLimits(): Limits {
  return { perTx: safeParse(getSetting('limit_per_tx'), DEFAULT_PER_TX), daily: safeParse(getSetting('limit_daily'), DEFAULT_DAILY) };
}

export function setLimits(perTx: string, daily: string): void {
  const p = parseUsdc(perTx);
  const d = parseUsdc(daily);
  if (p <= 0n || d <= 0n) throw new Error('Limits must be above zero.');
  setSetting('limit_per_tx', perTx);
  setSetting('limit_daily', daily);
}

/** True if either new value is higher than what is stored now (so the change needs re-authentication). */
export function isRaise(perTx: string, daily: string): boolean {
  const cur = getLimits();
  return parseUsdc(perTx) > cur.perTx || parseUsdc(daily) > cur.daily;
}

/** Everything this wallet signed in the last 24h (vouchers, plain transfers and cash outs count). */
export function spentLast24h(address: string, nowSec = Math.floor(Date.now() / 1000)): bigint {
  const rows = getDb().getAllSync<{ amount: string; kind: string }>(
    'SELECT amount, kind FROM transactions WHERE lower(from_address) = ? AND created_at > ?', [address.toLowerCase(), nowSec - DAY],
  );
  let sum = 0n;
  for (const r of rows) {
    try { sum += parseUsdc(r.amount); } catch { /* unreadable row */ }
  }
  return sum;
}

/** Returns an error message, or null when the payment (amount plus any courier fee, in base units) is allowed. */
export function checkLimits(totalUnits: bigint, address: string): string | null {
  const { perTx, daily } = getLimits();
  if (perTx > 0n && totalUnits > perTx) return `Over your per-payment limit of ${formatUsdc(perTx)} USDC. You can change it in Settings.`;
  if (daily > 0n) {
    const used = spentLast24h(address);
    if (used + totalUnits > daily) {
      return `This would pass your daily limit of ${formatUsdc(daily)} USDC (${formatUsdc(used)} used in the last 24h). You can change it in Settings.`;
    }
  }
  return null;
}
