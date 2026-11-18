import { createPublicClient, defineChain, http, type Address } from 'viem'

/** Arc Testnet. Gas is paid in USDC (18-decimal native unit); the ERC-20 facade at USDC_ADDRESS has 6 decimals. */
export const CHAIN = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' } },
  testnet: true,
})

export const EXPLORER = 'https://testnet.arcscan.app'
export const FAUCET_URL = 'https://faucet.circle.com'
export const USDC_ADDRESS: Address = '0x3600000000000000000000000000000000000000'
export const USDC_DECIMALS = 6

const DEFAULT_MESHPAY: Address = '0xd619b77bb8389a632800c300969ef152099f7691'
const envAddr = import.meta.env?.VITE_MESHPAY_ADDRESS as string | undefined
export const MESHPAY_ADDRESS: Address = (envAddr && /^0x[0-9a-fA-F]{40}$/.test(envAddr) ? envAddr : DEFAULT_MESHPAY) as Address

export const publicClient = createPublicClient({ chain: CHAIN, transport: http() })

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`
