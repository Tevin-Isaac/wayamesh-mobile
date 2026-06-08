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
  if (!toAddress) {
    return { valid: false, reason: 'Enter a recipient address' };
  }

  if (!ethers.isAddress(toAddress)) {
    return { valid: false, reason: 'Invalid recipient address' };
  }

  const amountNum = parseFloat(amount);
  if (!amount || isNaN(amountNum) || amountNum <= 0) {
    return { valid: false, reason: 'Enter an amount greater than zero' };
  }

  if (amountNum < 0.000001) {
    return { valid: false, reason: 'Amount too small' };
  }

  const balanceNum = parseFloat(balanceUsdc);
  // Reserve a tiny amount for gas (USDC is native gas on Arc)
  const reserveForGas = 0.0001;
  if (amountNum > balanceNum - reserveForGas) {
    return {
      valid: false,
      reason: `Insufficient balance (${Number(balanceUsdc).toFixed(4)} USDC available, ~${reserveForGas} reserved for gas)`,
    };
  }

  return { valid: true, estimatedGas: '~0.0001 USDC' };
}

export function suggestBatchWindow(pendingCount: number): string {
  if (pendingCount === 0) return 'No pending transactions';
  if (pendingCount < 3) return 'Will settle individually when connected';
  return `${pendingCount} transactions ready to batch-settle`;
}
