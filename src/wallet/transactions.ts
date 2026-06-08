import { ethers } from 'ethers';
import { CHAIN, USDC_DECIMALS } from '@/constants/chain';
import { saveTransaction, updateTransactionStatus, getPendingTransactions } from '@/db/queries';

// On Arc, USDC is the native token (like ETH on Ethereum).
// Transfers are plain value transactions — no ERC-20 contract needed.
// Gas is also paid in USDC (18 decimals).

export interface PendingTx {
  hash: string;
  to: string;
  amount: string;
  rawSigned: string;
}

function getRpcProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(CHAIN.rpc, {
    chainId: CHAIN.chainId,
    name: CHAIN.name,
  });
}

export async function getUsdcBalance(address: string): Promise<string> {
  const provider = getRpcProvider();
  const balance = await provider.getBalance(address);
  return ethers.formatUnits(balance, USDC_DECIMALS);
}

export async function getOnChainNonce(address: string): Promise<number> {
  const provider = getRpcProvider();
  return provider.getTransactionCount(address, 'latest');
}

export async function estimateGas(
  from: string,
  to: string,
  amountUsdc: string,
): Promise<string> {
  try {
    const provider = getRpcProvider();
    const value = ethers.parseUnits(amountUsdc, USDC_DECIMALS);
    const gas = await provider.estimateGas({ from, to, value });
    // Arc gas price is very low — estimate a worst-case fee in USDC
    const gasPrice = ethers.parseUnits('0.001', 'gwei');
    const fee = gas * gasPrice;
    return `~${ethers.formatUnits(fee, USDC_DECIMALS)} USDC`;
  } catch {
    return '~0.0001 USDC';
  }
}

export async function buildOfflineTransfer(
  wallet: ethers.Wallet,
  toAddress: string,
  usdcAmount: string,
  nonce: number,
): Promise<PendingTx> {
  const value = ethers.parseUnits(usdcAmount, USDC_DECIMALS);

  const tx: ethers.TransactionRequest = {
    to: toAddress,
    value,
    chainId: CHAIN.chainId,
    nonce,
    // Conservative gas limit for a native transfer on Arc
    gasLimit: 21_000n,
    maxFeePerGas: ethers.parseUnits('0.01', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('0.001', 'gwei'),
    type: 2,
  };

  const rawSigned = await wallet.signTransaction(tx);
  const hash = ethers.keccak256(rawSigned);

  saveTransaction({
    hash,
    from_address: wallet.address,
    to_address: toAddress,
    amount: usdcAmount,
    status: 'pending',
    raw_signed: rawSigned,
  });

  return { hash, to: toAddress, amount: usdcAmount, rawSigned };
}

export async function settleOnChain(rawSigned: string, hash: string): Promise<string> {
  const provider = getRpcProvider();
  const response = await provider.broadcastTransaction(rawSigned);
  await response.wait(1);
  updateTransactionStatus(hash, 'settled', response.hash);
  return response.hash;
}

export async function settlePendingTransactions(): Promise<void> {
  const pending = getPendingTransactions();
  for (const tx of pending) {
    try {
      await settleOnChain(tx.raw_signed, tx.hash);
    } catch {
      // Will retry on next connectivity event
    }
  }
}
