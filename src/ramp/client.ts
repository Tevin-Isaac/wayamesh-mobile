// Client for the Wayamesh ramp server (server/). Base URL: EXPO_PUBLIC_RAMP_API_URL.
import type { ethers } from 'ethers';

// ── Copied verbatim from server/src/authMessage.ts ──────────────────────────
export type RampAction = 'onramp' | 'offramp';
export function normalizePhone(input: string): string | null {
  const s = String(input ?? '').replace(/[\s\-()]/g, '');
  let d: string;
  if (/^\+254\d{9}$/.test(s)) d = s.slice(1);
  else if (/^254\d{9}$/.test(s)) d = s;
  else if (/^0\d{9}$/.test(s)) d = '254' + s.slice(1);
  else if (/^[71]\d{8}$/.test(s)) d = '254' + s;
  else return null;
  return /^254[17]\d{8}$/.test(d) ? d : null;
}
export function buildAuthMessage(p: {
  action: RampAction; address: string; phone: string; amount: string; issuedAt: number;
}): string {
  return `Wayamesh ramp\nAction: ${p.action}\nAddress: ${p.address}\nPhone: ${p.phone}\nAmount: ${p.amount}\nIssued: ${p.issuedAt}`;
}
// ────────────────────────────────────────────────────────────────────────────

export interface RampServerConfig {
  mock: boolean; network: string; usdKes: number; feeBps: number;
  minKes: number; maxKes: number; treasury: string | null;
}
export type OrderStatus = 'pending' | 'paid' | 'delivering' | 'completed' | 'failed';
export interface RampOrder {
  id: string; kind: 'onramp' | 'offramp'; status: OrderStatus;
  usdc: string; kes: number; phoneMasked: string;
  txHash?: string; mpesaReceipt?: string; reason?: string; mock?: boolean;
}

export const RAMP_API_URL = (process.env.EXPO_PUBLIC_RAMP_API_URL ?? '').replace(/\/$/, '');
export const isRampConfigured = () => RAMP_API_URL.length > 0;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isRampConfigured()) throw new Error('Ramp server not configured');
  const r = await fetch(RAMP_API_URL + path, {
    ...init, headers: { 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
  return j as T;
}

export const getConfig = () => call<RampServerConfig>('/api/ramp/config');
export const getOrder = (id: string) => call<RampOrder>(`/api/ramp/orders/${id}`);

/** Preview only — the server is authoritative. */
export function previewUsdcForKes(cfg: RampServerConfig, kes: number): number {
  return (kes / cfg.usdKes) * (1 - cfg.feeBps / 10000);
}
export function previewKesForUsdc(cfg: RampServerConfig, usdc: number): number {
  return Math.floor(usdc * cfg.usdKes * (1 - cfg.feeBps / 10000));
}

export async function startOnramp(
  wallet: ethers.Wallet, phoneInput: string, amountKes: number,
): Promise<{ id: string; status: OrderStatus; mock: boolean }> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new Error('Enter a valid Kenyan phone number');
  const issuedAt = Date.now();
  const signature = await wallet.signMessage(
    buildAuthMessage({ action: 'onramp', address: wallet.address, phone, amount: String(amountKes), issuedAt }),
  );
  return call('/api/ramp/onramp/mpesa', {
    method: 'POST', body: JSON.stringify({ address: wallet.address, phone, amountKes, issuedAt, signature }),
  });
}

/** `usdc` is a decimal string with at most 6 dp; txHash is the deposit to the treasury. */
export async function startOfframp(
  wallet: ethers.Wallet, phoneInput: string, usdc: string, txHash: string,
): Promise<{ id: string; status: OrderStatus }> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new Error('Enter a valid Kenyan phone number');
  const issuedAt = Date.now();
  const signature = await wallet.signMessage(
    buildAuthMessage({ action: 'offramp', address: wallet.address, phone, amount: usdc, issuedAt }),
  );
  return call('/api/ramp/offramp/mpesa', {
    method: 'POST', body: JSON.stringify({ address: wallet.address, phone, usdc, txHash, issuedAt, signature }),
  });
}

export async function pollOrder(
  id: string, onUpdate: (o: RampOrder) => void,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: { cancelled: boolean } } = {},
): Promise<RampOrder> {
  const { intervalMs = 2000, timeoutMs = 3 * 60_000, signal } = opts;
  const end = Date.now() + timeoutMs;
  let last: RampOrder | null = null;
  while (Date.now() < end && !signal?.cancelled) {
    try {
      last = await getOrder(id);
      onUpdate(last);
      if (last.status === 'completed' || last.status === 'failed') return last;
    } catch { /* transient; keep polling */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (last) return last;
  throw new Error('Timed out waiting for order');
}
