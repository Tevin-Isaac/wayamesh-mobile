// Account-abstraction (ERC-4337) config for smart-account wallets with Circle
// Paymaster, so users pay gas in USDC instead of a native token.
//
// All addresses VERIFIED against Circle's official docs (developers.circle.com/paymaster).
// Circle Paymaster is a permissionless deployed contract — no Circle account or API
// key required for the paymaster itself. A BUNDLER endpoint is still required to
// submit UserOperations (set EXPO_PUBLIC_BUNDLER_URL).

export type AaNetworkKey = 'base-sepolia' | 'base-mainnet' | 'arc-testnet';

export interface AaConfig {
  key: AaNetworkKey;
  chainId: number;
  rpcUrl: string;
  usdc: string;
  // EntryPoint v0.7 — broadest permissionless support today (Base + Arc).
  entryPointVersion: '0.7';
  /** Circle Paymaster v0.7 contract — pays gas in USDC. */
  paymaster: string;
  testnet: boolean;
}

export const AA_NETWORKS: Record<AaNetworkKey, AaConfig> = {
  'base-sepolia': {
    key: 'base-sepolia',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    entryPointVersion: '0.7',
    paymaster: '0x31BE08D380A21fc740883c0BC434FcFc88740b58',
    testnet: true,
  },
  // Same v0.7 paymaster address as Base Sepolia — Circle deploys it there too,
  // so the Arc migration is essentially a config switch once Arc mainnet ships.
  'arc-testnet': {
    key: 'arc-testnet',
    chainId: 5042002,
    rpcUrl: 'https://rpc.testnet.arc.network',
    usdc: '0x3600000000000000000000000000000000000000',
    entryPointVersion: '0.7',
    paymaster: '0x31BE08D380A21fc740883c0BC434FcFc88740b58',
    testnet: true,
  },
  'base-mainnet': {
    key: 'base-mainnet',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    entryPointVersion: '0.7',
    paymaster: '0x6C973eBe80dCD8660841D4356bf15c32460271C9',
    testnet: false,
  },
};

// Default to Base Sepolia for development. Flip via EXPO_PUBLIC_AA_NETWORK.
export const ACTIVE_AA_NETWORK: AaConfig =
  AA_NETWORKS[(process.env.EXPO_PUBLIC_AA_NETWORK as AaNetworkKey) ?? 'base-sepolia']
  ?? AA_NETWORKS['base-sepolia'];

// Bundler RPC endpoint (submits UserOps). Defaults to Pimlico's public endpoint
// for the active chain; set EXPO_PUBLIC_BUNDLER_URL to a keyed Pimlico/Alchemy/
// Circle endpoint for production-grade rate limits and reliability.
export const BUNDLER_URL =
  process.env.EXPO_PUBLIC_BUNDLER_URL ??
  `https://public.pimlico.io/v2/${ACTIVE_AA_NETWORK.chainId}/rpc`;
