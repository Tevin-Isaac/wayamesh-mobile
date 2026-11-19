import { defineChain, isAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { requireChain } from '@/onchain-facts'

/**
 * Which Arc network this build talks to. Set VITE_NETWORK=mainnet at build time for a
 * mainnet build. Anything else is testnet. Chain facts come from the shared chain list,
 * never from memory.
 */
export const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet'
export const NETWORK_LABEL = IS_MAINNET ? 'Arc' : 'Arc Testnet'

const mainnetFacts = requireChain(5042)
const arcMainnet = defineChain({
  id: mainnetFacts.chainId,
  name: mainnetFacts.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: mainnetFacts.nativeCurrency.decimals },
  rpcUrls: { default: { http: [mainnetFacts.rpcUrls[0]] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: mainnetFacts.explorerBase } },
})

export const CHAIN = IS_MAINNET ? arcMainnet : arcTestnet

/** Contracts that exist only on testnet. A mainnet build must never point at them. */
const TESTNET_ONLY_CONTRACTS = [
  '0xd619b77bb8389a632800c300969ef152099f7691', // MeshPayV2 testnet
  '0x41f84ad06cd7f256c67fbb62906899c29611d6ef', // MeshPay v1 testnet
]

/** A reason the build must not run, or null when the configuration is sound. */
export function configProblem(): string | null {
  const addr = import.meta.env.VITE_MESHPAY_ADDRESS as string | undefined
  if (!addr || !isAddress(addr)) return 'VITE_MESHPAY_ADDRESS is missing or is not a valid address.'
  if (IS_MAINNET && TESTNET_ONLY_CONTRACTS.includes(addr.toLowerCase())) {
    return 'This is a mainnet build but VITE_MESHPAY_ADDRESS is a testnet contract. Deploy MeshPayV2 on mainnet and set its address.'
  }
  const delay = Number(import.meta.env.VITE_MESHPAY_DELAY ?? 86400)
  if (!Number.isFinite(delay) || delay < 3600) return 'VITE_MESHPAY_DELAY must match the contract withdraw delay (at least 3600 seconds).'
  if (IS_MAINNET && delay < 86400) return 'A mainnet build needs a withdraw delay of at least one day (the plan is 604800 for seven days).'
  return null
}
