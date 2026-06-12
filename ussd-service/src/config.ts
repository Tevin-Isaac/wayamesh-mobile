import 'dotenv/config';

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  usdc: string;
  usdcDecimals: number;
  explorer: string;
  testnet: boolean;
}

// USDC addresses verified against Circle's official contract-address docs.
const NETWORKS: Record<string, NetworkConfig> = {
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    usdcDecimals: 6,
    explorer: 'https://sepolia.basescan.org',
    testnet: true,
  },
  'base-mainnet': {
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcDecimals: 6,
    explorer: 'https://basescan.org',
    testnet: false,
  },
};

const networkKey = process.env.NETWORK ?? 'base-sepolia';
const network = NETWORKS[networkKey];
if (!network) {
  throw new Error(`Unknown NETWORK "${networkKey}". Use one of: ${Object.keys(NETWORKS).join(', ')}`);
}

if (!process.env.MASTER_SECRET || process.env.MASTER_SECRET.length < 32) {
  throw new Error('MASTER_SECRET missing or too short. Run: openssl rand -hex 32');
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  masterSecret: process.env.MASTER_SECRET,
  network: { ...network, rpcUrl: process.env.RPC_URL ?? network.rpcUrl },
  treasuryKey: process.env.TREASURY_PRIVATE_KEY ?? '',
  // 4-digit PIN is the USSD norm (mobile-money parity). Weakness is mitigated by
  // server-side lockout + custodial controls, not by PIN entropy alone.
  pinLength: 4,
  lockout: { maxAttempts: 4, windowSeconds: 900 },
};

export type Config = typeof config;
