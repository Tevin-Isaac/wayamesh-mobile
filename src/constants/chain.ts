// ── Chain registry ─────────────────────────────────────────────────────────────
//
// Arc: USDC is the native gas token — no ERC-20 contract, 18 decimals.
// All other chains: USDC is Circle-issued ERC-20, 6 decimals, gas in ETH/MATIC.
//
// Flip `enabled: true` to unlock a chain in the UI when RPC + testing are ready.

export type UsdcMode =
  | { type: 'native'; decimals: number }
  | { type: 'erc20'; contract: string; decimals: number };

export interface ChainConfig {
  id: string;
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpc: string;
  rpcFallbacks: string[];
  explorer: string;
  usdc: UsdcMode;
  faucet?: string;
  testnet: boolean;
  enabled: boolean;
}

export const CHAINS: Record<string, ChainConfig> = {
  arc_testnet: {
    id: 'arc_testnet',
    chainId: 5042002,
    name: 'Arc Testnet',
    shortName: 'Arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpc: 'https://rpc.testnet.arc.network',
    rpcFallbacks: [
      'https://rpc.blockdaemon.testnet.arc.network',
      'https://rpc.quicknode.testnet.arc.network',
    ],
    explorer: 'https://testnet.arcscan.app',
    usdc: { type: 'native', decimals: 18 },
    faucet: 'https://faucet.circle.com',
    testnet: true,
    enabled: true,
  },

  ethereum: {
    id: 'ethereum',
    chainId: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://eth.llamarpc.com',
    rpcFallbacks: ['https://cloudflare-eth.com', 'https://rpc.ankr.com/eth'],
    explorer: 'https://etherscan.io',
    usdc: { type: 'erc20', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    testnet: false,
    enabled: false,
  },

  base: {
    id: 'base',
    chainId: 8453,
    name: 'Base',
    shortName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://mainnet.base.org',
    rpcFallbacks: ['https://base.llamarpc.com', 'https://base-rpc.publicnode.com'],
    explorer: 'https://basescan.org',
    usdc: { type: 'erc20', contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    testnet: false,
    enabled: false,
  },

  polygon: {
    id: 'polygon',
    chainId: 137,
    name: 'Polygon',
    shortName: 'POL',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpc: 'https://polygon-rpc.com',
    rpcFallbacks: ['https://polygon.llamarpc.com', 'https://polygon-bor-rpc.publicnode.com'],
    explorer: 'https://polygonscan.com',
    usdc: { type: 'erc20', contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    testnet: false,
    enabled: false,
  },

  arbitrum: {
    id: 'arbitrum',
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://arb1.arbitrum.io/rpc',
    rpcFallbacks: ['https://arbitrum.llamarpc.com', 'https://arbitrum-one-rpc.publicnode.com'],
    explorer: 'https://arbiscan.io',
    usdc: { type: 'erc20', contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    testnet: false,
    enabled: false,
  },

  optimism: {
    id: 'optimism',
    chainId: 10,
    name: 'Optimism',
    shortName: 'OP',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://mainnet.optimism.io',
    rpcFallbacks: ['https://optimism.llamarpc.com', 'https://optimism-rpc.publicnode.com'],
    explorer: 'https://optimistic.etherscan.io',
    usdc: { type: 'erc20', contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    testnet: false,
    enabled: false,
  },
};

export const ENABLED_CHAINS = Object.values(CHAINS).filter(c => c.enabled);

export const ACTIVE_CHAIN_ID = 'arc_testnet' as const;
export const ACTIVE_CHAIN    = CHAINS[ACTIVE_CHAIN_ID];

// ── Backward-compat aliases ────────────────────────────────────────────────────
export const CHAIN          = ACTIVE_CHAIN;
export const ACTIVE_NETWORK = 'testnet' as const;
export const USDC_DECIMALS  = ACTIVE_CHAIN.usdc.decimals;
