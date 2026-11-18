import { ethers } from 'ethers';
import { ACTIVE_CHAIN } from '@/constants/chain';
import { getDb } from '@/db/schema';
import { withRpc } from './rpc';
import {
  MESHPAY_ADDRESS, USDC_ERC20, VOUCHER_TTL_SECONDS, DEFAULT_FEE_UNITS,
  signPayment, encodeVoucher, decodeVoucher, randomNonce, randomRef, voucherId,
  parseUsdc, formatUsdc, type Voucher, type Payment,
} from '@/mesh/voucher';

// MeshPayV2 on-chain layer: reserve, deposit, delayed withdrawal, validation
// and settlement. Signing a voucher needs NO network; everything here that
// touches the chain is only ever called when a connection exists.

const PAYMENT_TUPLE = 'tuple(address from, address to, uint256 amount, uint256 fee, uint256 nonce, uint256 deadline, bytes32 ref)';

const MESHPAY_ABI = [
  'function deposit(address account, uint256 amount)',
  'function reserve(address) view returns (uint256)',
  'function withdrawalRequest(address) view returns (uint256 amount, uint256 unlockAt)',
  'function requestWithdraw(uint256 amount)',
  'function cancelWithdraw()',
  'function finalizeWithdraw()',
  `function check(${PAYMENT_TUPLE} p, bytes signature) view returns (uint8)`,
  `function settle(${PAYMENT_TUPLE} p, bytes signature)`,
  `function settleBatch(${PAYMENT_TUPLE}[] ps, bytes[] sigs) returns (uint8[])`,
  'event Settled(address indexed from, address indexed to, bytes32 indexed ref, uint256 nonce, uint256 amount, uint256 fee, address relayer)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];

/** Reject codes returned by the contract's check(). */
export const REJECT_LABELS: Record<number, string> = {
  1: 'Invalid payment',
  2: 'Expired',
  3: 'Already settled',
  4: 'Bad signature',
  5: 'Payer reserve too low',
  6: 'Transfer failed',
};

function toTuple(p: Payment) {
  return [p.from, p.to, p.amount, p.fee, p.nonce, p.deadline, p.ref] as const;
}

// ── reserve cache (so the offline sender knows what it can spend) ─────────────

export interface ReserveSnapshot {
  /** USDC display string, 6dp. */
  amount: string;
  /** Unix seconds when this was read from chain. */
  updatedAt: number;
}

function ensureCacheTable(): void {
  getDb().execSync(
    'CREATE TABLE IF NOT EXISTS reserve_cache (address TEXT PRIMARY KEY, amount TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  );
}

export function getCachedReserve(address: string): ReserveSnapshot | null {
  try {
    ensureCacheTable();
    const row = getDb().getFirstSync<{ amount: string; updated_at: number }>(
      'SELECT amount, updated_at FROM reserve_cache WHERE address = ?', [address.toLowerCase()],
    );
    return row ? { amount: row.amount, updatedAt: row.updated_at } : null;
  } catch {
    return null;
  }
}

function setCachedReserve(address: string, amount: string): void {
  try {
    ensureCacheTable();
    getDb().runSync(
      'INSERT OR REPLACE INTO reserve_cache (address, amount, updated_at) VALUES (?, ?, ?)',
      [address.toLowerCase(), amount, Math.floor(Date.now() / 1000)],
    );
  } catch { /* cache is best-effort */ }
}

/** Debit the cache after signing, so back-to-back offline payments can't overspend it. */
function debitCachedReserve(address: string, units: bigint): void {
  const cur = getCachedReserve(address);
  if (!cur) return;
  const next = parseUsdc(cur.amount) - units;
  setCachedReserve(address, formatUsdc(next < 0n ? 0n : next));
}

// ── reads ─────────────────────────────────────────────────────────────────────

export async function fetchReserve(address: string): Promise<string> {
  const units = await withRpc(async p => {
    const c = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, p);
    return (await c.reserve(address)) as bigint;
  });
  const amount = formatUsdc(units);
  setCachedReserve(address, amount);
  return amount;
}

export interface WithdrawalState {
  amount: string;
  unlockAt: number; // unix seconds
}

export async function fetchWithdrawal(address: string): Promise<WithdrawalState | null> {
  const [amt, unlockAt] = await withRpc(async p => {
    const c = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, p);
    return (await c.withdrawalRequest(address)) as [bigint, bigint];
  });
  if (amt === 0n) return null;
  return { amount: formatUsdc(amt), unlockAt: Number(unlockAt) };
}

/** On-chain pre-validation of a voucher. 0 = valid and currently funded. */
export async function checkVoucherOnChain(v: Voucher): Promise<number> {
  return withRpc(async p => {
    const c = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, p);
    return Number(await c.check(toTuple(v.payment), v.signature));
  });
}

// ── sign (offline) ────────────────────────────────────────────────────────────

export interface SignedVoucher {
  code: string;
  id: string;
  voucher: Voucher;
}

/** Sign a voucher entirely on-device. No network access is involved. */
export async function signVoucher(
  wallet: ethers.Wallet,
  to: string,
  usdcAmount: string,
  feeUnits: bigint = DEFAULT_FEE_UNITS,
): Promise<SignedVoucher> {
  const payment: Payment = {
    from: wallet.address,
    to: ethers.getAddress(to),
    amount: parseUsdc(usdcAmount),
    fee: feeUnits,
    nonce: randomNonce(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS),
    ref: randomRef(),
  };
  const signature = await signPayment(wallet, payment);
  const voucher: Voucher = { payment, signature };
  debitCachedReserve(wallet.address, payment.amount + payment.fee);
  return { code: encodeVoucher(voucher), id: voucherId(payment), voucher };
}

// ── funding / withdrawing the reserve (online, gas paid in USDC) ──────────────

function connect(wallet: ethers.Wallet, p: ethers.JsonRpcProvider): ethers.Wallet {
  return wallet.connect(p);
}

/** Move USDC from the wallet into the offline reserve (approve + deposit). */
export async function depositToReserve(wallet: ethers.Wallet, usdcAmount: string): Promise<string> {
  const units = parseUsdc(usdcAmount);
  return withRpc(async p => {
    const signer = connect(wallet, p);
    const usdc = new ethers.Contract(USDC_ERC20, ERC20_ABI, signer);
    const allowance = (await usdc.allowance(wallet.address, MESHPAY_ADDRESS)) as bigint;
    if (allowance < units) {
      const ap = await usdc.approve(MESHPAY_ADDRESS, units);
      await ap.wait(1);
    }
    const mp = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, signer);
    const tx = await mp.deposit(wallet.address, units);
    await tx.wait(1);
    await fetchReserve(wallet.address);
    return tx.hash as string;
  });
}

export async function requestReserveWithdraw(wallet: ethers.Wallet, usdcAmount: string): Promise<string> {
  const units = parseUsdc(usdcAmount);
  return withRpc(async p => {
    const mp = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, connect(wallet, p));
    const tx = await mp.requestWithdraw(units);
    await tx.wait(1);
    return tx.hash as string;
  });
}

export async function cancelReserveWithdraw(wallet: ethers.Wallet): Promise<string> {
  return withRpc(async p => {
    const mp = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, connect(wallet, p));
    const tx = await mp.cancelWithdraw();
    await tx.wait(1);
    return tx.hash as string;
  });
}

export async function finalizeReserveWithdraw(wallet: ethers.Wallet): Promise<string> {
  return withRpc(async p => {
    const mp = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, connect(wallet, p));
    const tx = await mp.finalizeWithdraw();
    await tx.wait(1);
    await fetchReserve(wallet.address);
    return tx.hash as string;
  });
}

// ── settlement ────────────────────────────────────────────────────────────────

export type SettleOutcome =
  | { status: 'settled'; txHash: string }
  | { status: 'already'; }                 // someone else settled it first
  | { status: 'waiting'; reason: string }  // not funded right now — may succeed later
  | { status: 'failed'; reason: string };  // can never settle (expired, bad signature, cancelled)

/**
 * Settle one voucher on-chain from this phone. The caller is the courier and
 * collects the voucher's fee. Needs this wallet's key to pay gas.
 */
export async function settleVoucher(wallet: ethers.Wallet, v: Voucher): Promise<SettleOutcome> {
  try {
    return await withRpc(async p => {
      const mp = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, connect(wallet, p));
      const code = Number(await mp.check(toTuple(v.payment), v.signature));

      if (code === 3) return { status: 'already' } as SettleOutcome;
      if (code === 2) return { status: 'failed', reason: 'Expired before it could settle' } as SettleOutcome;
      if (code === 1 || code === 4) {
        return { status: 'failed', reason: REJECT_LABELS[code] } as SettleOutcome;
      }
      if (code === 5) {
        return { status: 'waiting', reason: 'Payer reserve is too low right now' } as SettleOutcome;
      }

      const tx = await mp.settle(toTuple(v.payment), v.signature);
      await tx.wait(1);
      return { status: 'settled', txHash: tx.hash as string } as SettleOutcome;
    });
  } catch (e) {
    return { status: 'waiting', reason: e instanceof Error ? e.message : 'Network unavailable' };
  }
}

/** Find the on-chain Settled transaction for a voucher (by payer + unique ref), if recent. */
export async function findSettledTx(v: Voucher): Promise<string | null> {
  try {
    return await withRpc(async p => {
      const mp = new ethers.Contract(MESHPAY_ADDRESS, MESHPAY_ABI, p);
      const latest = await p.getBlockNumber();
      const logs = await mp.queryFilter(
        mp.filters.Settled(v.payment.from, null, v.payment.ref),
        Math.max(0, latest - 100_000),
        latest,
      );
      return logs.length ? logs[0].transactionHash : null;
    });
  } catch {
    return null;
  }
}

export function explorerTxUrl(hash: string): string {
  return `${ACTIVE_CHAIN.explorer}/tx/${hash}`;
}

export { decodeVoucher };
