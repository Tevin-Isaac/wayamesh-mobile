import { ethers } from 'ethers';
import { ACTIVE_CHAIN, type ChainConfig } from '@/constants/chain';
import { saveTransaction, updateTransactionStatus, getPendingTransactions } from '@/db/queries';
import { withRpc } from './rpc';
import { getEffectiveNonce, setLocalNonce } from './nonce';

// Arc gas rules (native USDC chain):
//   • Min base fee: 20 Gwei — we use 40 Gwei (2× buffer) for offline safety
//   • Priority fee: 0 (confirmed per Arc docs)
//   • Native transfer gas: 21 000

const GAS_LIMIT_NATIVE  = 21_000n;
const GAS_LIMIT_ERC20   = 65_000n;  // ERC-20 transfer on other chains
const MAX_FEE_PER_GAS   = ethers.parseUnits('40', 'gwei');
const PRIORITY_FEE      = 0n;

// Minimal ABI for USDC ERC-20 operations
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  totalFeeFormatted: string; // in the chain's native currency (e.g. USDC on Arc, ETH elsewhere)
  totalFeeWei: bigint;
  feeCurrency: string;       // 'USDC' on Arc, 'ETH' on Ethereum/Base/Arbitrum, etc.
  totalFeeUsdc: string;      // backward-compat alias for totalFeeFormatted on Arc
}

export interface PendingTx {
  hash: string;
  to: string;
  amount: string;
  rawSigned: string;
  nonce: number;
  gasEstimate: GasEstimate;
  chainId: number;
}

// ── Balance ───────────────────────────────────────────────────────────────────

/**
 * Fetch USDC balance for an address on the given chain.
 * Arc: native balance. Other chains: ERC-20 balanceOf call.
 */
export async function getUsdcBalance(
  address: string,
  chain: ChainConfig = ACTIVE_CHAIN,
): Promise<string> {
  const { usdc } = chain;
  if (usdc.type === 'native') {
    return withRpc(
      p => p.getBalance(address).then(bal => ethers.formatUnits(bal, usdc.decimals)),
      chain,
    );
  }
  return withRpc(async p => {
    const contract = new ethers.Contract(usdc.contract, ERC20_ABI, p);
    const bal      = await contract.balanceOf(address) as bigint;
    return ethers.formatUnits(bal, usdc.decimals);
  }, chain);
}

// ── Gas estimation ────────────────────────────────────────────────────────────

export async function estimateGas(
  from: string,
  to: string,
  amountUsdc: string,
  chain: ChainConfig = ACTIVE_CHAIN,
): Promise<GasEstimate> {
  const { usdc } = chain;
  const baseLimit = usdc.type === 'native' ? GAS_LIMIT_NATIVE : GAS_LIMIT_ERC20;
  const feeCurrency = chain.nativeCurrency.symbol;

  try {
    let gasLimit: bigint;
    if (usdc.type === 'native') {
      const value = ethers.parseUnits(amountUsdc, usdc.decimals);
      gasLimit = await withRpc(p => p.estimateGas({ from, to, value }), chain);
    } else {
      const iface  = new ethers.Interface(ERC20_ABI);
      const data   = iface.encodeFunctionData('transfer', [
        ethers.getAddress(to),
        ethers.parseUnits(amountUsdc, usdc.decimals),
      ]);
      gasLimit = await withRpc(p => p.estimateGas({ from, to: usdc.contract, data, value: 0n }), chain);
    }
    const feeWei = gasLimit * MAX_FEE_PER_GAS;
    const feeFormatted = ethers.formatUnits(feeWei, chain.nativeCurrency.decimals);
    return { gasLimit, maxFeePerGas: MAX_FEE_PER_GAS, totalFeeFormatted: feeFormatted, totalFeeWei: feeWei, feeCurrency, totalFeeUsdc: feeFormatted };
  } catch {
    const feeWei = baseLimit * MAX_FEE_PER_GAS;
    const feeFormatted = ethers.formatUnits(feeWei, chain.nativeCurrency.decimals);
    return { gasLimit: baseLimit, maxFeePerGas: MAX_FEE_PER_GAS, totalFeeFormatted: feeFormatted, totalFeeWei: feeWei, feeCurrency, totalFeeUsdc: feeFormatted };
  }
}

// ── Signing ───────────────────────────────────────────────────────────────────

/**
 * Build and sign an EIP-1559 transaction offline.
 * Handles both native USDC (Arc) and ERC-20 USDC (Ethereum, Base, etc.).
 * Verifies recovered signer before saving; advances local nonce immediately.
 */
export async function buildOfflineTransfer(
  wallet: ethers.Wallet,
  toAddress: string,
  usdcAmount: string,
  gas?: GasEstimate,
  chain: ChainConfig = ACTIVE_CHAIN,
): Promise<PendingTx> {
  const checksummedTo = ethers.getAddress(toAddress);
  const { usdc }      = chain;
  const nonce         = await getEffectiveNonce(wallet.address);
  const gasEstimate   = gas ?? await estimateGas(wallet.address, checksummedTo, usdcAmount, chain);

  let tx: ethers.TransactionRequest;

  if (usdc.type === 'native') {
    tx = {
      to:                   checksummedTo,
      value:                ethers.parseUnits(usdcAmount, usdc.decimals),
      chainId:              chain.chainId,
      nonce,
      gasLimit:             gasEstimate.gasLimit,
      maxFeePerGas:         gasEstimate.maxFeePerGas,
      maxPriorityFeePerGas: PRIORITY_FEE,
      type: 2,
    };
  } else {
    const iface = new ethers.Interface(ERC20_ABI);
    tx = {
      to:                   ethers.getAddress(usdc.contract),
      value:                0n,
      data:                 iface.encodeFunctionData('transfer', [
        checksummedTo,
        ethers.parseUnits(usdcAmount, usdc.decimals),
      ]),
      chainId:              chain.chainId,
      nonce,
      gasLimit:             gasEstimate.gasLimit,
      maxFeePerGas:         gasEstimate.maxFeePerGas,
      maxPriorityFeePerGas: PRIORITY_FEE,
      type: 2,
    };
  }

  const rawSigned = await wallet.signTransaction(tx);

  // Verify recovered signer matches the wallet address before persisting
  const recovered = ethers.Transaction.from(rawSigned).from?.toLowerCase();
  if (recovered !== wallet.address.toLowerCase()) {
    throw new Error(`Signature verification failed: recovered ${recovered}, expected ${wallet.address}`);
  }

  const hash = ethers.keccak256(rawSigned);
  setLocalNonce(wallet.address, nonce + 1);

  saveTransaction({
    hash,
    from_address: wallet.address,
    to_address:   checksummedTo,
    amount:       usdcAmount,
    status:       'pending',
    raw_signed:   rawSigned,
  });

  return { hash, to: checksummedTo, amount: usdcAmount, rawSigned, nonce, gasEstimate, chainId: chain.chainId };
}

// ── Settlement ────────────────────────────────────────────────────────────────

export async function settleOnChain(
  rawSigned: string,
  hash: string,
  chain: ChainConfig = ACTIVE_CHAIN,
): Promise<string> {
  return withRpc(async p => {
    try {
      const response = await p.broadcastTransaction(rawSigned);
      await response.wait(1);
      updateTransactionStatus(hash, 'settled', response.hash);
      return response.hash;
    } catch (err) {
      // With QR/BLE handoff, several devices can hold the same signed tx —
      // whoever reconnects first settles it, and the others' broadcast then
      // fails ("already known" / "nonce too low"). Check the chain before
      // treating that as an error.
      const receipt = await p.getTransactionReceipt(hash);
      if (receipt && receipt.status === 1) {
        updateTransactionStatus(hash, 'settled', hash);
        return hash;
      }
      throw err;
    }
  }, chain);
}

export interface SettleResult {
  attempted: number;
  settled: number;
  failed: number;
}

/**
 * Try to broadcast every pending transaction. Safe to call repeatedly — already
 * settled txs are no longer pending, and re-broadcasting the same nonce is a
 * harmless no-op on-chain. Returns counts so callers can decide whether to retry.
 */
export async function settlePendingTransactions(): Promise<SettleResult> {
  const pending = getPendingTransactions();
  let settled = 0;
  let failed  = 0;
  for (const tx of pending) {
    try {
      await settleOnChain(tx.raw_signed, tx.hash);
      settled++;
    } catch {
      failed++; // offline / RPC down — retried on next tick or foreground
    }
  }
  return { attempted: pending.length, settled, failed };
}

// ── Legacy compat ─────────────────────────────────────────────────────────────

export async function getOnChainNonce(address: string): Promise<number> {
  return withRpc(p => p.getTransactionCount(address, 'latest'));
}
