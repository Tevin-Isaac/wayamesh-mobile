import { ethers } from 'ethers';
import { CHAIN, USDC_ADDRESS } from '@/constants/chain';
import { saveTransaction, updateTransactionStatus, getPendingTransactions } from '@/db/queries';

const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export interface PendingTx {
  hash: string;
  to: string;
  amount: string;
  rawSigned: string;
}

export async function buildOfflineTransfer(
  wallet: ethers.Wallet,
  toAddress: string,
  usdcAmount: string,
  nonce: number,
): Promise<PendingTx> {
  const iface = new ethers.Interface(USDC_ABI);
  const amountWei = ethers.parseUnits(usdcAmount, 6); // USDC is 6 decimals

  const tx: ethers.TransactionRequest = {
    to: USDC_ADDRESS,
    data: iface.encodeFunctionData('transfer', [toAddress, amountWei]),
    chainId: CHAIN.chainId,
    nonce,
    gasLimit: 100_000n,
    maxFeePerGas: ethers.parseUnits('1', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
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
  const provider = new ethers.JsonRpcProvider(CHAIN.rpc);
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

export async function getUsdcBalance(address: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(CHAIN.rpc);
  const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
  const balance: bigint = await contract.balanceOf(address);
  return ethers.formatUnits(balance, 6);
}
