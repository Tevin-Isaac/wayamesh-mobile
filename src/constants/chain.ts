export const ARC_CHAIN = {
  testnet: {
    chainId: 50312,
    name: 'Somnia Testnet',
    rpc: 'https://dream-rpc.somnia.network',
    explorer: 'https://somnia-testnet.socialscan.io',
  },
  mainnet: {
    chainId: 5042002,
    name: 'Arc Mainnet',
    rpc: 'https://rpc.arc.network',
    explorer: 'https://explorer.arc.network',
  },
} as const;

export const USDC_ADDRESS = '0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00';

export const ACTIVE_NETWORK: 'testnet' | 'mainnet' = 'testnet';

export const CHAIN = ARC_CHAIN[ACTIVE_NETWORK];
