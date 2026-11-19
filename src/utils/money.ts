import { ethers } from 'ethers';

// Exact money formatting. Balances are decimal STRINGS from chain data (ethers.formatUnits), never floats,
// and we TRUNCATE for display: a wallet must never show more than it holds (19.9967 is not "20.00").

/** Truncate (never round) a non-negative decimal string to `dp` decimal places. */
export function truncate(value: string, dp: number): string {
  const [int, frac = ''] = value.split('.');
  if (dp <= 0) return int;
  return `${int}.${(frac + '0'.repeat(dp)).slice(0, dp)}`;
}

/** Up to 6 decimals, trailing zeros trimmed, but always at least 2 decimals. */
export function exact6(value: string): string {
  const t = truncate(value, 6).replace(/0+$/, '');
  const [int, frac = ''] = t.split('.');
  return `${int}.${(frac + '00').slice(0, Math.max(2, frac.length))}`;
}

/** Exact sum of two non-negative decimal strings (each with at most 18 decimals). Throws on malformed input. */
export function addDecimal(a: string, b: string): string {
  return ethers.formatUnits(ethers.parseUnits(a, 18) + ethers.parseUnits(b, 18), 18);
}

/** Like addDecimal, but safe to call while rendering: null in, or anything malformed, gives null instead of a crash. */
export function tryAdd(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return null;
  try { return addDecimal(a, b); } catch { return null; }
}
