// On/off-ramp configuration — self-custody pattern: we embed a LICENSED
// provider's hosted flow with the user's address pre-filled. The provider
// handles fiat, KYC, and compliance; USDC lands directly in the user's wallet.
// We never touch fiat and never take custody.
//
// Ramps only operate on MAINNET. Until then (or until an API key is set) the
// ramp screen falls back to the Circle faucet path for testnet USDC.
//
// Activate later with two env values (then confirm exact URL params against the
// provider's current docs — they occasionally rename them):
//   EXPO_PUBLIC_RAMP_PROVIDER=onramper | transak
//   EXPO_PUBLIC_RAMP_API_KEY=<your key>

export type RampProvider = 'onramper' | 'transak';

export interface RampConfig {
  provider: RampProvider;
  apiKey: string;
}

export function getRampConfig(): RampConfig | null {
  const provider = process.env.EXPO_PUBLIC_RAMP_PROVIDER as RampProvider | undefined;
  const apiKey = process.env.EXPO_PUBLIC_RAMP_API_KEY;
  if (!provider || !apiKey) return null;
  if (provider !== 'onramper' && provider !== 'transak') return null;
  return { provider, apiKey };
}

/**
 * Hosted BUY flow (fiat → USDC to the user's address).
 * Targets USDC on Base (our chosen mainnet path — supported by every major ramp).
 */
export function buildBuyUrl(cfg: RampConfig, address: string): string {
  if (cfg.provider === 'onramper') {
    const q = new URLSearchParams({
      apiKey: cfg.apiKey,
      mode: 'buy',
      defaultCrypto: 'usdc_base',
      onlyCryptos: 'usdc_base',
      wallets: `usdc_base:${address}`,
    });
    return `https://buy.onramper.com/?${q.toString()}`;
  }
  // transak
  const q = new URLSearchParams({
    apiKey: cfg.apiKey,
    productsAvailed: 'BUY',
    cryptoCurrencyCode: 'USDC',
    network: 'base',
    walletAddress: address,
    disableWalletAddressForm: 'true',
  });
  return `https://global.transak.com/?${q.toString()}`;
}

/** Hosted SELL flow (USDC → fiat payout via the provider). */
export function buildSellUrl(cfg: RampConfig, address: string): string {
  if (cfg.provider === 'onramper') {
    const q = new URLSearchParams({
      apiKey: cfg.apiKey,
      mode: 'sell',
      defaultCrypto: 'usdc_base',
      onlyCryptos: 'usdc_base',
      wallets: `usdc_base:${address}`,
    });
    return `https://buy.onramper.com/?${q.toString()}`;
  }
  const q = new URLSearchParams({
    apiKey: cfg.apiKey,
    productsAvailed: 'SELL',
    cryptoCurrencyCode: 'USDC',
    network: 'base',
    walletAddress: address,
  });
  return `https://global.transak.com/?${q.toString()}`;
}

// Africa-first fast-follow (M-Pesa / mobile money rails): Kotani Pay, Yellow
// Card, Fonbnk. These are B2B API integrations rather than hosted widgets —
// tracked as the next rail once the aggregator path is live.
export const FAUCET_URL = 'https://faucet.circle.com';
