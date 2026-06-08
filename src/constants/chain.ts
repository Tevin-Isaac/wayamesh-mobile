export const ARC_CHAIN = {
  testnet: {
    chainId: 5042002,
    name: 'Arc Testnet',
    // Primary + fallback RPC endpoints
    rpc: 'https://rpc.testnet.arc.network',
    rpcFallbacks: [
      'https://rpc.blockdaemon.testnet.arc.network',
      'https://rpc.quicknode.testnet.arc.network',
    ],
    explorer: 'https://testnet.arcscan.app',
    faucet: 'https://faucet.circle.com',
    // USDC is the native gas token on Arc (18 decimals — not ERC-20)
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  },
} as const;

export const ACTIVE_NETWORK = 'testnet' as const;
export const CHAIN = ARC_CHAIN[ACTIVE_NETWORK];

// USDC is native on Arc — no ERC-20 contract needed for basic transfers.
// Decimals: 18 (Arc) vs 6 (standard USDC on Ethereum/Base)
export const USDC_DECIMALS = 18;
