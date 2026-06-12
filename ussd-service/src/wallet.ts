import { ethers } from 'ethers';
import { config } from './config.js';
import { encryptSecret } from './crypto.js';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

export function provider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.network.rpcUrl, {
    chainId: config.network.chainId,
    name: config.network.name,
  });
}

/** Create a fresh custodial wallet; returns address + encrypted private key. */
export function createCustodialWallet(): { address: string; encryptedKey: string } {
  const w = ethers.Wallet.createRandom();
  return { address: w.address, encryptedKey: encryptSecret(w.privateKey) };
}

/** On-chain USDC balance of an address (base units, 6dp). */
export async function onChainUsdcBalance(address: string): Promise<bigint> {
  const usdc = new ethers.Contract(config.network.usdc, ERC20_ABI, provider());
  return (await usdc.balanceOf(address)) as bigint;
}

/**
 * Withdraw: send USDC on-chain from the treasury to an external address.
 * Used when a user cashes out / sends to an off-platform wallet. Gas (ETH) is
 * paid by the treasury — for production, sponsor via a paymaster or smart account.
 */
export async function treasurySendUsdc(toAddress: string, baseUnits: bigint): Promise<string> {
  if (!config.treasuryKey) throw new Error('Treasury key not configured');
  const signer = new ethers.Wallet(config.treasuryKey, provider());
  const usdc = new ethers.Contract(config.network.usdc, ERC20_ABI, signer);
  const tx = await usdc.transfer(ethers.getAddress(toAddress), baseUnits);
  const receipt = await tx.wait(1);
  return receipt?.hash ?? tx.hash;
}

// USDC display helpers (6 decimals).
export function toBaseUnits(human: string): bigint {
  return ethers.parseUnits(human, config.network.usdcDecimals);
}
export function fromBaseUnits(units: bigint | number): string {
  return ethers.formatUnits(BigInt(units), config.network.usdcDecimals);
}
export function isAddress(a: string): boolean {
  return ethers.isAddress(a);
}
