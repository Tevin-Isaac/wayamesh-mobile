import { ethers } from 'ethers';
import { ACTIVE_CHAIN } from '@/constants/chain';
import { decodeVoucher, isVoucherCode, voucherId, offlineRejection, formatUsdc } from './voucher';

// Payment envelope — the unit of offline value transfer.
//
// An envelope is nothing but a signed, settlement-ready transaction wrapped in
// a versioned prefix. Everything the receiver needs to trust is DERIVED from
// the signature itself (sender, recipient, amount, chain, nonce) — there is no
// metadata to forge. Whoever holds the envelope can settle it on Arc; nobody
// can alter it. It travels over any transport: QR code today, BLE next.

export const ENVELOPE_PREFIX = 'WMTX1:';
// v2 adds transport metadata (courier payout address) around the same signed tx.
export const ENVELOPE_PREFIX_V2 = 'WMTX2:';

const ERC20_IFACE = new ethers.Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export interface DecodedEnvelope {
  /** Transaction hash — settlement id and dedup key. */
  hash: string;
  /** Sender, recovered from the signature (cannot be spoofed). */
  from: string;
  /** USDC recipient. */
  to: string;
  /** Display amount in USDC (e.g. "3.0"). */
  amount: string;
  /** The raw signed transaction — the thing that settles. */
  rawSigned: string;
  nonce: number;
  chainId: number;
  /**
   * Payout address of the mesh courier who delivered this envelope, if it
   * arrived via relay. Transport metadata only — NOT covered by the payment
   * signature, so it must never be trusted for anything beyond a voluntary,
   * mandate-gated tip.
   */
  courier?: string;
  /** 'voucher' = MeshPayV2 voucher (`rawSigned` is the mp2: code); 'transfer' = raw signed tx. */
  kind?: 'transfer' | 'voucher';
  /** Voucher only: courier fee (USDC) paid to whoever settles. */
  fee?: string;
  /** Voucher only: unix-seconds deadline after which it can no longer settle. */
  deadline?: number;
}

export function encodeEnvelope(rawSigned: string, courier?: string): string {
  // Vouchers carry their own courier fee, so they travel as-is.
  if (isVoucherCode(rawSigned)) return rawSigned.trim();
  if (courier && ethers.isAddress(courier)) {
    return ENVELOPE_PREFIX_V2 + JSON.stringify({ t: rawSigned, c: courier });
  }
  return ENVELOPE_PREFIX + rawSigned;
}

export function isEnvelope(payload: string): boolean {
  const p = payload.trim();
  return p.startsWith(ENVELOPE_PREFIX) || p.startsWith(ENVELOPE_PREFIX_V2) || isVoucherCode(p);
}

/**
 * Decode and verify an envelope. Throws with a human-readable reason if the
 * payload is not a valid, signed USDC transfer for the active chain.
 */
export function decodeEnvelope(payload: string): DecodedEnvelope {
  const trimmed = payload.trim();

  if (isVoucherCode(trimmed)) {
    const v = decodeVoucher(trimmed);
    const reason = offlineRejection(v);
    if (reason) throw new Error(reason);
    return {
      hash: voucherId(v.payment),
      from: v.payment.from,
      to: v.payment.to,
      amount: formatUsdc(v.payment.amount),
      rawSigned: trimmed,
      nonce: Number(v.payment.nonce % 2n ** 31n),
      chainId: ACTIVE_CHAIN.chainId,
      kind: 'voucher',
      fee: formatUsdc(v.payment.fee),
      deadline: Number(v.payment.deadline),
    };
  }

  let rawSigned: string;
  let courier: string | undefined;

  if (trimmed.startsWith(ENVELOPE_PREFIX_V2)) {
    let meta: { t?: string; c?: string };
    try { meta = JSON.parse(trimmed.slice(ENVELOPE_PREFIX_V2.length)); }
    catch { throw new Error('Corrupted payment — bad envelope metadata'); }
    if (typeof meta.t !== 'string') throw new Error('Corrupted payment — missing transaction');
    rawSigned = meta.t;
    if (typeof meta.c === 'string' && ethers.isAddress(meta.c)) courier = ethers.getAddress(meta.c);
  } else if (trimmed.startsWith(ENVELOPE_PREFIX)) {
    rawSigned = trimmed.slice(ENVELOPE_PREFIX.length);
  } else {
    throw new Error('Not a Wayamesh payment code');
  }

  let tx: ethers.Transaction;
  try {
    tx = ethers.Transaction.from(rawSigned);
  } catch {
    throw new Error('Corrupted payment — could not parse the signed transaction');
  }

  const from = tx.from; // recovered from signature; null/throws if unsigned
  if (!from || !tx.signature) {
    throw new Error('Payment is not signed');
  }
  if (Number(tx.chainId) !== ACTIVE_CHAIN.chainId) {
    throw new Error(`Wrong network — payment is for chain ${tx.chainId}, expected ${ACTIVE_CHAIN.chainId}`);
  }

  const { usdc } = ACTIVE_CHAIN;
  let to: string;
  let amountUnits: bigint;

  if (usdc.type === 'native') {
    if (!tx.to || tx.value <= 0n) throw new Error('Not a USDC transfer');
    to = tx.to;
    amountUnits = tx.value;
  } else {
    if (!tx.to || tx.to.toLowerCase() !== usdc.contract.toLowerCase()) {
      throw new Error('Not a USDC transfer');
    }
    let parsed: ethers.TransactionDescription | null = null;
    try { parsed = ERC20_IFACE.parseTransaction({ data: tx.data }); } catch { /* fallthrough */ }
    if (!parsed || parsed.name !== 'transfer') throw new Error('Not a USDC transfer');
    to = parsed.args[0] as string;
    amountUnits = parsed.args[1] as bigint;
    if (amountUnits <= 0n) throw new Error('Not a USDC transfer');
  }

  return {
    hash: tx.hash ?? ethers.keccak256(rawSigned),
    from,
    to,
    amount: ethers.formatUnits(amountUnits, usdc.decimals),
    rawSigned,
    nonce: tx.nonce,
    chainId: Number(tx.chainId),
    // A courier tipping themselves as sender/recipient is meaningless.
    courier: courier && courier.toLowerCase() !== from.toLowerCase() && courier.toLowerCase() !== to.toLowerCase()
      ? courier
      : undefined,
  };
}
