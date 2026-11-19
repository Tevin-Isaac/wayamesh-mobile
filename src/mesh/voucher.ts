import { ethers } from 'ethers';

// MeshPayV2 voucher — the unit of offline value transfer.
//
// A voucher is an EIP-712 signed authorization to pay `amount` (+ courier `fee`)
// out of the payer's prepaid reserve held in the MeshPayV2 contract on Arc.
// Because the reserve is on-chain, a receiver can verify "funded" before
// accepting, and ANY phone can settle it (the settler earns the fee).
//
// Wire format is shared byte-for-byte with the Wayamesh web wallet:
//   `mp2:` + base64url of 178 bytes
//   1 version | 20 from | 20 to | 16 amount | 8 fee | 8 nonce | 8 deadline | 32 ref | 65 signature

export const MESHPAY_ADDRESS = '0xd619b77bb8389a632800c300969ef152099f7691';
/** Arc's ERC-20 facade over native USDC (6 decimals). The reserve is held in this token. */
export const USDC_ERC20 = '0x3600000000000000000000000000000000000000';
export const USDC_DECIMALS = 6;
export const CHAIN_ID = 5042002;

/** Contract-enforced delay before a reserve withdrawal can finish (verified on-chain: 86400). */
export const WITHDRAW_DELAY_SECONDS = 86_400;
/** Vouchers live 24h — never longer than the withdrawal delay, so 'sign, hand over, withdraw' can't win. */
export const VOUCHER_TTL_SECONDS = 24 * 60 * 60;
/** A receiver refuses vouchers that stay valid longer than the delay (plus clock allowance). */
export const MAX_ACCEPTED_TTL_SECONDS = WITHDRAW_DELAY_SECONDS + 3600;
/** A receiver refuses vouchers about to expire — too little time to reach a connection. */
export const MIN_REMAINING_SECONDS = 15 * 60;
/** Courier fee paid from the payer's reserve to whoever settles (0.01 USDC). */
export const DEFAULT_FEE_UNITS = 10_000n;

export const VOUCHER_PREFIX = 'mp2:';
const VOUCHER_BYTES = 178;

export const ZERO_REF = '0x' + '00'.repeat(32);

export const DOMAIN = {
  name: 'MeshPay',
  version: '2',
  chainId: CHAIN_ID,
  verifyingContract: MESHPAY_ADDRESS,
} as const;

export const PAYMENT_TYPES = {
  Payment: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'ref', type: 'bytes32' },
  ],
};

export interface Payment {
  from: string;
  to: string;
  /** USDC base units (6 dp). */
  amount: bigint;
  fee: bigint;
  nonce: bigint;
  deadline: bigint;
  ref: string;
}

export interface Voucher {
  payment: Payment;
  signature: string;
}

// ── base64url (self-contained: no reliance on atob/Buffer being present) ──────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toB64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += B64[b2 & 63];
  }
  return out;
}

export function fromB64Url(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  const out: number[] = [];
  let acc = 0, bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Damaged payment code');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

const HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

/**
 * The contract accepts only one canonical form of a signature (v is 27 or 28, s is at most half the curve order).
 * Anything else could never settle, so a receiver must not hold it as a payment.
 */
export function isCanonicalSignature(sig: string): boolean {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return false;
  const v = parseInt(sig.slice(130, 132), 16);
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  return (v === 27 || v === 28) && s > 0n && s <= HALF_N;
}

function uint(n: bigint, size: number): Uint8Array {
  return ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(n), size));
}

// ── codec ─────────────────────────────────────────────────────────────────────

export function encodeVoucher(v: Voucher): string {
  const p = v.payment;
  const bytes = new Uint8Array(VOUCHER_BYTES);
  bytes[0] = 2;
  bytes.set(ethers.getBytes(p.from), 1);
  bytes.set(ethers.getBytes(p.to), 21);
  bytes.set(uint(p.amount, 16), 41);
  bytes.set(uint(p.fee, 8), 57);
  bytes.set(uint(p.nonce, 8), 65);
  bytes.set(uint(p.deadline, 8), 73);
  bytes.set(ethers.getBytes(p.ref), 81);
  bytes.set(ethers.getBytes(v.signature), 113);
  return VOUCHER_PREFIX + toB64Url(bytes);
}

export function isVoucherCode(text: string): boolean {
  return text.trim().startsWith(VOUCHER_PREFIX);
}

export function decodeVoucher(text: string): Voucher {
  const raw = text.trim();
  if (!raw.startsWith(VOUCHER_PREFIX)) throw new Error('Not a MeshPay payment code');
  const bytes = fromB64Url(raw.slice(VOUCHER_PREFIX.length));
  if (bytes.length !== VOUCHER_BYTES || bytes[0] !== 2) {
    throw new Error('Unsupported or damaged payment code');
  }
  const at = (a: number, b: number) => ethers.hexlify(bytes.slice(a, b));
  if (!isCanonicalSignature(at(113, 178))) {
    throw new Error('This payment code has a malformed signature and could never settle');
  }
  return {
    payment: {
      from: ethers.getAddress(at(1, 21)),
      to: ethers.getAddress(at(21, 41)),
      amount: BigInt(at(41, 57)),
      fee: BigInt(at(57, 65)),
      nonce: BigInt(at(65, 73)),
      deadline: BigInt(at(73, 81)),
      ref: at(81, 113),
    },
    signature: at(113, 178),
  };
}

// ── signing / verification (no network) ───────────────────────────────────────

export function randomNonce(): bigint {
  return BigInt(ethers.hexlify(ethers.randomBytes(8)));
}

export function randomRef(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

/** Signs entirely on the device. */
export async function signPayment(wallet: ethers.Wallet, payment: Payment): Promise<string> {
  return wallet.signTypedData(DOMAIN, PAYMENT_TYPES, payment);
}

export function signerOf(v: Voucher): string {
  return ethers.verifyTypedData(DOMAIN, PAYMENT_TYPES, v.payment, v.signature);
}

export function isSignatureValid(v: Voucher): boolean {
  try {
    return signerOf(v).toLowerCase() === v.payment.from.toLowerCase();
  } catch {
    return false;
  }
}

/** Stable identity of a voucher: (payer, nonce). Used as the dedup / settlement key. */
export function voucherId(p: Pick<Payment, 'from' | 'nonce'>): string {
  return ethers.solidityPackedKeccak256(['address', 'uint256'], [p.from, p.nonce]);
}

export function formatUsdc(units: bigint): string {
  return ethers.formatUnits(units, USDC_DECIMALS);
}

export function parseUsdc(amount: string): bigint {
  return ethers.parseUnits(amount, USDC_DECIMALS);
}

/**
 * Offline checks a receiver can do with zero connectivity. Returns a human
 * reason on failure, or null when the voucher is acceptable.
 */
export function offlineRejection(v: Voucher, nowSec = Math.floor(Date.now() / 1000)): string | null {
  const p = v.payment;
  if (p.amount <= 0n) return 'Payment amount is zero';
  if (!isSignatureValid(v)) return 'Signature is not valid';
  const deadline = Number(p.deadline);
  if (deadline <= nowSec) return 'Payment has expired';
  if (deadline - nowSec > MAX_ACCEPTED_TTL_SECONDS) {
    return 'Payment stays valid too long — the payer could withdraw their reserve first';
  }
  if (deadline - nowSec < MIN_REMAINING_SECONDS) return 'Payment is about to expire';
  return null;
}
