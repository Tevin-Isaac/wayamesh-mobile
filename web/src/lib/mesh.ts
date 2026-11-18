/**
 * MeshPayV2 vouchers: EIP-712 signed payments and the compact `mp2:` wire format (178 bytes, base64url,
 * fits one QR code). The format and domain MUST stay identical to the phone app so both can pay each other.
 */
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
import { CHAIN, MESHPAY_ADDRESS } from './chain'

export const WITHDRAW_DELAY_SECONDS = 86400
export const VOUCHER_TTL_SECONDS = 24 * 60 * 60
/** A receiver refuses payments that stay valid longer than the withdrawal delay (plus a small clock allowance). */
export const MAX_ACCEPTED_TTL_SECONDS = WITHDRAW_DELAY_SECONDS + 3600
export const ZERO_REF: Hex = `0x${'00'.repeat(32)}`

export const MESHPAY_ABI = parseAbi([
  'struct Payment { address from; address to; uint256 amount; uint256 fee; uint256 nonce; uint256 deadline; bytes32 ref; }',
  'function deposit(address account, uint256 amount)',
  'function reserve(address) view returns (uint256)',
  'function withdrawalRequest(address) view returns (uint256 amount, uint256 unlockAt)',
  'function requestWithdraw(uint256 amount)',
  'function cancelWithdraw()',
  'function finalizeWithdraw()',
  'function cancelNonce(uint256 nonce)',
  'function nonceUsed(address, uint256) view returns (bool)',
  'function check(Payment p, bytes signature) view returns (uint8)',
  'function settle(Payment p, bytes signature)',
  'function settleBatch(Payment[] ps, bytes[] sigs) returns (uint8[])',
  'function WITHDRAW_DELAY() view returns (uint256)',
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

export function domain(verifyingContract: Address = MESHPAY_ADDRESS) {
  return { name: 'MeshPay', version: '2', chainId: CHAIN.id, verifyingContract } as const
}

export const TYPES = {
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

type TypedSigner = { signTypedData: (args: any) => Promise<Hex> }

/** Signs entirely on the device. No network access is involved. */
export async function signPayment(account: TypedSigner, payment: Payment, verifyingContract?: Address): Promise<Hex> {
  return account.signTypedData({ domain: domain(verifyingContract), types: TYPES, primaryType: 'Payment', message: payment })
}

/** Recovers the signer without any network access. */
export async function signerOf(v: Voucher, verifyingContract?: Address): Promise<Address> {
  return recoverTypedDataAddress({
    domain: domain(verifyingContract),
    types: TYPES,
    primaryType: 'Payment',
    message: v.payment,
    signature: v.signature,
  })
}

export async function isSignatureValid(v: Voucher, verifyingContract?: Address): Promise<boolean> {
  try {
    return isAddressEqual(await signerOf(v, verifyingContract), v.payment.from)
  } catch {
    return false
  }
}

export function voucherId(p: Pick<Payment, 'from' | 'nonce'>): string {
  return `${p.from.toLowerCase()}:${p.nonce.toString()}`
}

// ---- compact wire format v2: 178 bytes, base64url ----
// 1 version | 20 from | 20 to | 16 amount | 8 fee | 8 nonce | 8 deadline | 32 ref | 65 signature

export const VOUCHER_PREFIX = 'mp2:'
export const VOUCHER_BYTES = 178

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
  if (!raw.startsWith(VOUCHER_PREFIX)) throw new Error('Not a Wayamesh payment code.')
  let bytes: Uint8Array
  try {
    bytes = fromB64Url(raw.slice(VOUCHER_PREFIX.length))
  } catch {
    throw new Error('Unsupported or damaged payment code.')
  }
  if (bytes.length !== VOUCHER_BYTES || bytes[0] !== 2) throw new Error('Unsupported or damaged payment code.')
  const at = (from: number, to: number) => bytesToHex(bytes.slice(from, to))
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

/** Accepts a bare 0x address or an `ethereum:` URI (what the phone's Receive QR shows). */
export function parseAddressQr(text: string): Address | null {
  const t = text.trim()
  const raw = t.toLowerCase().startsWith('ethereum:') ? t.slice(9).split(/[?@]/)[0] : t
  return isAddress(raw) ? getAddress(raw) : null
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
