import { ethers } from 'ethers';
import { buildOfflineTransfer } from '@/wallet/transactions';
import { evaluateAndRecord, logAudit } from '@/agent/store';

// Courier nanopayments — the mesh pays itself.
//
// When a payment reaches its recipient through a courier, the recipient's
// agent tips the courier a micro-USDC fee: proposed automatically, checked
// against the user's mandate envelope (per-tx / daily / total caps), signed
// offline, settled at reconnect. An agent-to-agent nanopayment that works
// with zero connectivity — carrying money over the mesh is paid work.
//
// The courier address is transport metadata (not signature-protected), so the
// tip is strictly voluntary and strictly mandate-bounded: a forged courier
// field can never extract more than the envelope the user already granted.

export const COURIER_TIP_USDC = '0.05';
const TIP_UNITS = 50_000n; // 0.05 USDC in 6dp base units

export type TipOutcome =
  | { status: 'tipped'; txHash: string; amount: string }
  | { status: 'denied'; reason: string }
  | { status: 'skipped'; reason: string };

/**
 * Propose and (if the mandate allows) execute a courier tip.
 * Never throws — a failed tip must never break payment acceptance.
 */
export async function tipCourier(
  wallet: ethers.Wallet,
  courier: string,
): Promise<TipOutcome> {
  try {
    if (!ethers.isAddress(courier)) return { status: 'skipped', reason: 'No valid courier address' };
    if (courier.toLowerCase() === wallet.address.toLowerCase()) {
      return { status: 'skipped', reason: 'Courier is this wallet' };
    }

    const decision = evaluateAndRecord(courier, TIP_UNITS);
    if (!decision.active) return { status: 'skipped', reason: 'No active agent mandate' };
    if (!decision.allowed) return { status: 'denied', reason: decision.reason };

    const tx = await buildOfflineTransfer(wallet, courier, COURIER_TIP_USDC);
    logAudit({
      kind: 'execution', to: courier, amount: TIP_UNITS,
      allowed: true, reason: 'Courier tip — mesh delivery', txHash: tx.hash,
    });
    return { status: 'tipped', txHash: tx.hash, amount: COURIER_TIP_USDC };
  } catch (e) {
    return { status: 'skipped', reason: e instanceof Error ? e.message : 'Tip failed' };
  }
}
