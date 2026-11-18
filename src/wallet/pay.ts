import { ethers } from 'ethers';
import { saveTransaction } from '@/db/queries';
import { buildOfflineTransfer } from './transactions';
import { getCachedReserve, signVoucher } from './meshpay';
import { DEFAULT_FEE_UNITS, formatUsdc, parseUsdc } from '@/mesh/voucher';

// One entry point for "send money". Prefers a MeshPayV2 voucher drawn from the
// offline reserve (receiver can verify it's funded; any phone can settle it).
// With no/insufficient reserve it falls back to a plain signed transfer from
// the wallet balance, so sending always works.

export type PayMode = 'voucher' | 'direct';

export interface PayPlan {
  mode: PayMode;
  /** Courier fee in USDC (voucher only). */
  fee: string;
  /** Cached reserve in USDC, or null if never funded/read. */
  reserve: string | null;
}

export interface PayResult {
  /** Local id: voucher id or tx hash. Pass to /payment-qr. */
  hash: string;
  mode: PayMode;
  fee: string;
}

export function planPayment(address: string | null, usdcAmount: string): PayPlan {
  const reserve = address ? getCachedReserve(address)?.amount ?? null : null;
  const fee = formatUsdc(DEFAULT_FEE_UNITS);
  try {
    if (reserve !== null && usdcAmount) {
      if (parseUsdc(reserve) >= parseUsdc(usdcAmount) + DEFAULT_FEE_UNITS) {
        return { mode: 'voucher', fee, reserve };
      }
    }
  } catch { /* unparsable amount → direct */ }
  return { mode: 'direct', fee: '0', reserve };
}

export async function sendPayment(
  wallet: ethers.Wallet,
  to: string,
  usdcAmount: string,
): Promise<PayResult> {
  const plan = planPayment(wallet.address, usdcAmount);
  if (plan.mode === 'voucher') {
    const signed = await signVoucher(wallet, to, usdcAmount);
    saveTransaction({
      hash: signed.id,
      from_address: wallet.address,
      to_address: ethers.getAddress(to),
      amount: usdcAmount,
      status: 'pending',
      raw_signed: signed.code,
      kind: 'voucher',
    });
    return { hash: signed.id, mode: 'voucher', fee: plan.fee };
  }
  const tx = await buildOfflineTransfer(wallet, to, usdcAmount);
  return { hash: tx.hash, mode: 'direct', fee: '0' };
}
