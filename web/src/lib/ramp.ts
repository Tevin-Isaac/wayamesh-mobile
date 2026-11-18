/**
 * M-Pesa on/off-ramp client. Talks to the Wayamesh backend (server/):
 *   GET  /api/ramp/config
 *   POST /api/ramp/onramp/mpesa   {address, phone, amountKes, issuedAt, signature}
 *   POST /api/ramp/offramp/mpesa  {address, phone, usdc, txHash, issuedAt, signature}
 *   GET  /api/ramp/orders/:id
 * Requests are authenticated by an EIP-191 personal_sign over `rampAuthMessage` so only the wallet's owner
 * can start an order for its address. The backend base URL comes from VITE_RAMP_API_URL.
 */
import { getAddress, type Address, type Hex } from 'viem'

export type RampAction = 'onramp' | 'offramp'
export type OrderStatus = 'pending' | 'paid' | 'delivering' | 'completed' | 'failed'

export interface RampConfig {
  mock: boolean
  network: string
  usdKes: number
  feeBps: number
  minKes: number
  maxKes: number
  treasury: Address
}

export interface RampOrder {
  id: string
  kind: RampAction
  status: OrderStatus
  usdc: string
  kes: string | number
  txHash?: string
  mpesaReceipt?: string
  reason?: string
}

const rawBase = (import.meta.env?.VITE_RAMP_API_URL as string | undefined) ?? ''
export const RAMP_BASE_URL = rawBase.trim().replace(/\/+$/, '')
export const rampConfigured = () => RAMP_BASE_URL.length > 0

/**
 * Exactly the string the backend verifies. `amount` is the KES amount for onramp, the USDC string for offramp.
 */
export function rampAuthMessage(p: { action: RampAction; address: string; phone: string; amount: string | number; issuedAt: number }): string {
  return [
    'Wayamesh ramp',
    `Action: ${p.action}`,
    `Address: ${getAddress(p.address)}`,
    `Phone: ${p.phone}`,
    `Amount: ${p.amount}`,
    `Issued: ${p.issuedAt}`,
  ].join('\n')
}

/** Accepts 0712345678, 712345678, +254712345678, 254712345678 and returns 254712345678, or null. */
export function normalizeKenyanPhone(input: string): string | null {
  const d = input.replace(/[\s\-()]/g, '').replace(/^\+/, '')
  let n: string
  if (/^254\d{9}$/.test(d)) n = d
  else if (/^0\d{9}$/.test(d)) n = `254${d.slice(1)}`
  else if (/^\d{9}$/.test(d)) n = `254${d}`
  else return null
  return /^254[17]\d{8}$/.test(n) ? n : null
}

/** USDC the user receives for `kes`, net of the fee. */
export function previewOnramp(kes: number, cfg: Pick<RampConfig, 'usdKes' | 'feeBps'>): number {
  if (!(kes > 0) || !(cfg.usdKes > 0)) return 0
  return (kes / cfg.usdKes) * (1 - cfg.feeBps / 10_000)
}

/** KES paid out for `usdc`, net of the fee. */
export function previewOfframp(usdc: number, cfg: Pick<RampConfig, 'usdKes' | 'feeBps'>): number {
  if (!(usdc > 0) || !(cfg.usdKes > 0)) return 0
  return usdc * cfg.usdKes * (1 - cfg.feeBps / 10_000)
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if (!rampConfigured()) throw new Error('Ramp server not configured.')
  const res = await fetch(`${RAMP_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (body as { error?: string; message?: string } | null)?.error ?? (body as { message?: string } | null)?.message
    throw new Error(msg || `Ramp server error (${res.status}).`)
  }
  return body as T
}

export const getRampConfig = () => http<RampConfig>('/api/ramp/config')
export const getOrder = (id: string) => http<RampOrder>(`/api/ramp/orders/${encodeURIComponent(id)}`)

type Signer = { signMessage: (a: { message: string }) => Promise<Hex> }

export async function startOnramp(account: Signer & { address: Address }, phone: string, amountKes: number): Promise<RampOrder> {
  const address = getAddress(account.address)
  const issuedAt = Date.now()
  const signature = await account.signMessage({
    message: rampAuthMessage({ action: 'onramp', address, phone, amount: amountKes, issuedAt }),
  })
  return http<RampOrder>('/api/ramp/onramp/mpesa', {
    method: 'POST',
    body: JSON.stringify({ address, phone, amountKes, issuedAt, signature }),
  })
}

export async function startOfframp(account: Signer & { address: Address }, phone: string, usdc: string, txHash: Hex): Promise<RampOrder> {
  const address = getAddress(account.address)
  const issuedAt = Date.now()
  const signature = await account.signMessage({
    message: rampAuthMessage({ action: 'offramp', address, phone, amount: usdc, issuedAt }),
  })
  return http<RampOrder>('/api/ramp/offramp/mpesa', {
    method: 'POST',
    body: JSON.stringify({ address, phone, usdc, txHash, issuedAt, signature }),
  })
}

export const TERMINAL: OrderStatus[] = ['completed', 'failed']
