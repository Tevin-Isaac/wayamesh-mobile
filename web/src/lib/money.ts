import { formatUnits, parseUnits } from 'viem'

export function parseUsdc(value: string): bigint {
  const v = value.trim()
  if (!/^\d*\.?\d{0,6}$/.test(v) || v === '' || v === '.') throw new Error('Enter a USDC amount (up to 6 decimals).')
  return parseUnits(v, 6)
}

export const formatUsdc = (raw: bigint): string => formatUnits(raw, 6)

/** Two-decimal display with thousands separators. */
export function fmt2(raw: bigint): string {
  const n = Number(formatUnits(raw, 6))
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const shortAddr = (a: string) => (a.length < 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`)
export const midAddr = (a: string) => (a.length < 20 ? a : `${a.slice(0, 10)}…${a.slice(-8)}`)

export function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.ceil(s / 60)}m`
  return `${Math.ceil(s / 3600)}h`
}

/** Full-precision amount with at least two decimals ("3.50", "0.000001"). */
export function fmtFull(raw: bigint): string {
  const [w, f = ''] = formatUnits(raw, 6).split('.')
  return `${w}.${f.padEnd(2, '0')}`
}
