import { ethers } from 'ethers';
import { ACTIVE_CHAIN } from '@/constants/chain';

// Payment envelope — the unit of offline value transfer.
//
// An envelope is nothing but a signed, settlement-ready transaction wrapped in
// a versioned prefix. Everything the receiver needs to trust is DERIVED from
// the signature itself (sender, recipient, amount, chain, nonce) — there is no
// metadata to forge. Whoever holds the envelope can settle it on Arc; nobody
// can alter it. It travels over any transport: QR code today, BLE next.

export const ENVELOPE_PREFIX = 'WMTX1:';

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
}

export function encodeEnvelope(rawSigned: string): string {
  return ENVELOPE_PREFIX + rawSigned;
}

export function isEnvelope(payload: string): boolean {
  return payload.trim().startsWith(ENVELOPE_PREFIX);
}

/**
 * Decode and verify an envelope. Throws with a human-readable reason if the
 * payload is not a valid, signed USDC transfer for the active chain.
 */
export function decodeEnvelope(payload: string): DecodedEnvelope {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(ENVELOPE_PREFIX)) {
    throw new Error('Not a Wayamesh payment code');
  }
  const rawSigned = trimmed.slice(ENVELOPE_PREFIX.length);

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
  };
}
