import { ethers } from 'ethers';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  estimatedGas?: string;
}

export function validateTransfer(
  toAddress: string,
  amount: string,
  balanceUsdc: string,
): ValidationResult {
  if (!ethers.isAddress(toAddress)) {
    return { valid: false, reason: 'Invalid recipient address' };
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return { valid: false, reason: 'Amount must be greater than zero' };
  }

  if (amountNum < 0.01) {
    return { valid: false, reason: 'Minimum transfer is 0.01 USDC' };
  }

  const balanceNum = parseFloat(balanceUsdc);
  if (amountNum > balanceNum) {
    return { valid: false, reason: `Insufficient balance (${balanceUsdc} USDC available)` };
  }

  // Estimated gas cost on Arc (~480ms finality, very low fees)
  const estimatedGas = '~0.0001 ARC';

  return { valid: true, estimatedGas };
}

export function suggestBatchWindow(pendingCount: number): string {
  if (pendingCount === 0) return 'No pending transactions';
  if (pendingCount < 3) return 'Settle individually when connected';
  return `Batch ${pendingCount} transactions for lower fees`;
}

export function routingScore(peerId: string, _signalStrength: number): number {
  // Placeholder: weight by signal strength when ONNX model is loaded
  return Math.abs(peerId.charCodeAt(0) % 100);
}
