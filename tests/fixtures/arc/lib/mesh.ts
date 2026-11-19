import {
  bytesToHex,
  getAddress,
  hexToBytes,
  isAddress,
  isAddressEqual,
  numberToHex,
  parseAbi,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'
import { getUsdc } from '@/onchain-facts'
import { CHAIN } from './network'

export { CHAIN }
export const MESHPAY_ADDRESS = import.meta.env.VITE_MESHPAY_ADDRESS as Address
export const USDC_ADDRESS = (getUsdc(CHAIN.id)?.address ?? '0x3600000000000000000000000000000000000000') as Address

/**
 * Contract-enforced delay before a reserve withdrawal can finish. Payments must not outlive it,
 * otherwise a payer could sign, hand over and withdraw before the payment settles.
 */
export const WITHDRAW_DELAY_SECONDS = Number(import.meta.env.VITE_MESHPAY_DELAY ?? 86400)

/** Offline payments are valid for 24 hours, never longer than the contract's withdrawal delay. */
export const VOUCHER_TTL_SECONDS = Math.min(24 * 60 * 60, WITHDRAW_DELAY_SECONDS)

/** A receiver refuses payments that stay valid longer than the withdrawal delay (plus a small clock allowance). */
export const MAX_ACCEPTED_TTL_SECONDS = WITHDRAW_DELAY_SECONDS + 3600

export const ZERO_REF: Hex = `0x${'00'.repeat(32)}`

export const MESHPAY_ABI = parseAbi([
  'struct Payment { address from; address to; uint256 amount; uint256 fee; uint256 nonce; uint256 deadline; bytes32 ref; }',
  'function deposit(address account, uint256 amount)',
  'function reserve(address) view returns (uint256)',
  'function check(Payment p, bytes signature) view returns (uint8)',
  'function settle(Payment p, bytes signature)',
  'function settleBatch(Payment[] ps, bytes[] sigs) returns (uint8[])',
  'function WITHDRAW_DELAY() view returns (uint256)',
  'function withdrawalRequest(address) view returns (uint256 amount, uint256 unlockAt)',
  'event Settled(address indexed from, address indexed to, bytes32 indexed ref, uint256 nonce, uint256 amount, uint256 fee, address relayer)',
  'event Rejected(address indexed from, uint256 nonce, uint8 code)',
])

export interface Payment {
  from: Address
  to: Address
  amount: bigint
  /** Courier tip, paid from the payer's reserve to whoever settles the payment. */
  fee: bigint
  nonce: bigint
  deadline: bigint
  /** Invoice or chat reference. All zeros when unused. */
  ref: Hex
}

export interface Voucher {
  payment: Payment
  signature: Hex
}

const DOMAIN = {
  name: 'MeshPay',
  version: '2',
  chainId: CHAIN.id,
  verifyingContract: MESHPAY_ADDRESS,
} as const

const TYPES = {
  Payment: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'ref', type: 'bytes32' },
  ],
} as const

export function randomNonce(): bigint {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return BigInt(bytesToHex(bytes))
}

/** Signs entirely on the device. No network access is involved. */
export async function signPayment(account: Pick<ReturnType<typeof privateKeyToAccount>, 'signTypedData'>, payment: Payment): Promise<Hex> {
  return account.signTypedData({
    domain: DOMAIN,
    types: TYPES,
    primaryType: 'Payment',
    message: payment,
  })
}

/** Recovers the signer without any network access. */
export async function signerOf(v: Voucher): Promise<Address> {
  return recoverTypedDataAddress({
    domain: DOMAIN,
    types: TYPES,
    primaryType: 'Payment',
    message: v.payment,
    signature: v.signature,
  })
}

export async function isSignatureValid(v: Voucher): Promise<boolean> {
  try {
    return isAddressEqual(await signerOf(v), v.payment.from)
  } catch {
    return false
  }
}

const HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n

/** The contract only accepts one canonical form of a signature. Anything else would be stuck unsettled. */
export function isCanonicalSignature(sig: Hex): boolean {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return false
  const v = parseInt(sig.slice(130, 132), 16)
  const s = BigInt(`0x${sig.slice(66, 130)}`)
  return (v === 27 || v === 28) && s > 0n && s <= HALF_N
}

export function randomRef(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export function voucherId(p: Pick<Payment, 'from' | 'nonce'>): string {
  return `${p.from.toLowerCase()}:${p.nonce.toString()}`
}

// ---- compact wire format v2: 178 bytes, base64url, fits a single QR code ----
// 1 version | 20 from | 20 to | 16 amount | 8 fee | 8 nonce | 8 deadline | 32 ref | 65 signature

const VOUCHER_PREFIX = 'mp2:'
const VOUCHER_BYTES = 178

export function toB64Url(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => {
    s += String.fromCharCode(b)
  })
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function uint(n: bigint, size: number): Uint8Array {
  return hexToBytes(numberToHex(n, { size }))
}

export function encodeVoucher(v: Voucher): string {
  const p = v.payment
  const bytes = new Uint8Array(VOUCHER_BYTES)
  bytes[0] = 2
  bytes.set(hexToBytes(p.from), 1)
  bytes.set(hexToBytes(p.to), 21)
  bytes.set(uint(p.amount, 16), 41)
  bytes.set(uint(p.fee, 8), 57)
  bytes.set(uint(p.nonce, 8), 65)
  bytes.set(uint(p.deadline, 8), 73)
  bytes.set(hexToBytes(p.ref), 81)
  bytes.set(hexToBytes(v.signature), 113)
  return VOUCHER_PREFIX + toB64Url(bytes)
}

export function isVoucherCode(text: string): boolean {
  return text.trim().startsWith(VOUCHER_PREFIX)
}

export function decodeVoucher(text: string): Voucher {
  const raw = text.trim()
  if (!raw.startsWith(VOUCHER_PREFIX)) throw new Error('Not a MeshPay payment code.')
  const bytes = fromB64Url(raw.slice(VOUCHER_PREFIX.length))
  if (bytes.length !== VOUCHER_BYTES || bytes[0] !== 2) throw new Error('Unsupported or damaged payment code.')
  const at = (from: number, to: number) => bytesToHex(bytes.slice(from, to))
  if (!isCanonicalSignature(at(113, 178))) throw new Error('This payment code has a malformed signature and could never settle.')
  return {
    payment: {
      from: getAddress(at(1, 21)),
      to: getAddress(at(21, 41)),
      amount: BigInt(at(41, 57)),
      fee: BigInt(at(57, 65)),
      nonce: BigInt(at(65, 73)),
      deadline: BigInt(at(73, 81)),
      ref: at(81, 113),
    },
    signature: at(113, 178),
  }
}

// ---- payment requests: what a receiver shows so the payer can scan an address ----

const REQUEST_PREFIX = 'meshpay:'

export interface PaymentRequest {
  address: Address
  amount?: string
  /** Invoice reference the payment must carry so the receiver can match it. */
  ref?: Hex
  note?: string
}

export function encodeRequest(r: PaymentRequest): string {
  const q = new URLSearchParams()
  if (r.amount) q.set('amount', r.amount)
  if (r.ref) q.set('ref', r.ref)
  if (r.note) q.set('note', r.note.slice(0, 80))
  const query = q.toString()
  return `${REQUEST_PREFIX}${r.address}${query ? `?${query}` : ''}`
}

/** Strips control and direction-changing characters so text from a stranger cannot disguise itself. */
export function cleanText(input: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim().slice(0, max)
}

export function parseRequest(text: string): PaymentRequest | null {
  const raw = text.trim()
  if (!raw.startsWith(REQUEST_PREFIX)) return null
  const [addr, query] = raw.slice(REQUEST_PREFIX.length).split('?')
  if (!isAddress(addr)) return null
  const q = new URLSearchParams(query ?? '')
  const ref = q.get('ref')
  const amount = q.get('amount')
  const note = q.get('note')
  return {
    address: getAddress(addr),
    amount: amount && /^\d{1,12}(\.\d{1,6})?$/.test(amount) ? amount : undefined,
    ref: ref && /^0x[0-9a-fA-F]{64}$/.test(ref) ? (ref as Hex) : undefined,
    note: note ? cleanText(note, 80) : undefined,
  }
}

/** Reject codes returned by the MeshPay contract. */
export const REJECT_LABELS: Record<number, string> = {
  1: 'Invalid payment',
  2: 'Expired',
  3: 'Already settled',
  4: 'Bad signature',
  5: 'Payer reserve too low',
  6: 'Transfer failed',
}
