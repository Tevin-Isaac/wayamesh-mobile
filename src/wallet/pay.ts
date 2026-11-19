import { ethers } from 'ethers';
import { saveTransaction } from '@/db/queries';
import { buildOfflineTransfer } from './transactions';
import { getCachedReserve, signVoucher } from './meshpay';
import { DEFAULT_FEE_UNITS, formatUsdc, parseUsdc } from '@/mesh/voucher';
import { unsafeRecipient } from '@/utils/safety';
import { checkLimits } from './limits';
import { getWallet } from '@/db/queries';

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

export class PaymentBlocked extends Error {}

export interface SendOptions {
  /** Invoice / request reference to carry inside the signed voucher. */
  ref?: string;
  /** Refuse to fall back to a plain signed transfer (chat payments must be vouchers). */
  voucherOnly?: boolean;
}

export async function sendPayment(
  wallet: ethers.Wallet,
  to: string,
  usdcAmount: string,
  opts: SendOptions = {},
): Promise<PayResult> {
  if (!ethers.isAddress(to)) throw new PaymentBlocked('That is not a valid address.');
  if (to.toLowerCase() === wallet.address.toLowerCase()) throw new PaymentBlocked('That is this device. Pick another address.');
  const unsafe = unsafeRecipient(to);
  if (unsafe) throw new PaymentBlocked(unsafe);
  let units: bigint;
  try { units = parseUsdc(usdcAmount); } catch { throw new PaymentBlocked('Enter a valid amount.'); }
  if (units <= 0n) throw new PaymentBlocked('Enter an amount above zero.');
  const plan = planPayment(wallet.address, usdcAmount);
  if (opts.voucherOnly && plan.mode !== 'voucher') {
    throw new PaymentBlocked('Chat payments are sent from your offline reserve. Add funds to the reserve first, or use Send.');
  }
  const blocked = checkLimits(units + (plan.mode === 'voucher' ? DEFAULT_FEE_UNITS : 0n), getWallet()?.address ?? wallet.address);
  if (blocked) throw new PaymentBlocked(blocked);
  if (plan.mode === 'voucher') {
    const signed = await signVoucher(wallet, to, usdcAmount, DEFAULT_FEE_UNITS, opts.ref);
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
