import { readFileSync, existsSync } from 'node:fs';

export function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export interface Config {
  port: number;
  mode: 'mock' | 'sandbox' | 'production';
  mock: boolean;
  consumerKey: string; consumerSecret: string; shortcode: string; passkey: string;
  txType: 'paybill' | 'till';
  callbackBase: string; callbackSecret: string;
  initiatorName: string; securityCredential: string; b2cShortcode: string;
  rpcUrl: string; treasuryKey: string; chainId: number; networkName: string; meshpay: string;
  usdKes: number; feeBps: number; minKes: number; maxKes: number;
  origins: string[]; dataFile: string;
}

export function loadConfig(env = process.env): Config {
  const e = (k: string, d = '') => (env[k] ?? d).trim();
  const hasCreds = !!(e('DARAJA_CONSUMER_KEY') && e('DARAJA_CONSUMER_SECRET') && e('DARAJA_SHORTCODE') && e('DARAJA_PASSKEY'));
  let mode = e('MPESA_MODE', hasCreds ? 'sandbox' : 'mock') as Config['mode'];
  if (!['mock', 'sandbox', 'production'].includes(mode)) mode = 'mock';
  if (mode !== 'mock' && !hasCreds) mode = 'mock';
  return {
    port: Number(e('PORT', '8787')), mode, mock: mode === 'mock',
    consumerKey: e('DARAJA_CONSUMER_KEY'), consumerSecret: e('DARAJA_CONSUMER_SECRET'),
    shortcode: e('DARAJA_SHORTCODE'), passkey: e('DARAJA_PASSKEY'),
    txType: e('MPESA_TX_TYPE', 'paybill').toLowerCase() === 'till' ? 'till' : 'paybill',
    callbackBase: e('DARAJA_CALLBACK_BASE_URL').replace(/\/$/, ''), callbackSecret: e('CALLBACK_SECRET', 'change-me'),
    initiatorName: e('INITIATOR_NAME'), securityCredential: e('SECURITY_CREDENTIAL'),
    b2cShortcode: e('B2C_SHORTCODE') || e('DARAJA_SHORTCODE'),
    rpcUrl: e('ARC_RPC_URL', 'https://rpc.testnet.arc.network'), treasuryKey: e('TREASURY_PRIVATE_KEY'),
    meshpay: e('MESHPAY_ADDRESS'), chainId: Number(e('ARC_CHAIN_ID', '5042002')), networkName: e('ARC_NETWORK_NAME', 'arc-testnet'),
    usdKes: Number(e('USD_KES_RATE', '129')), feeBps: Number(e('FEE_BPS', '100')),
    minKes: Number(e('MIN_KES', '10')), maxKes: Number(e('MAX_KES', '150000')),
    origins: e('ALLOWED_ORIGINS', '*').split(',').map((s) => s.trim()).filter(Boolean),
    dataFile: e('DATA_FILE', './data/orders.json'),
  };
}

/**
 * Problems that make a non-mock (sandbox / production Daraja) run unsafe. Empty in mock mode.
 * index.ts refuses to start while this list is non-empty.
 */
export function unsafeConfig(c: Config): string[] {
  if (c.mock) return [];
  const out: string[] = [];
  if (c.callbackSecret.length < 24 || c.callbackSecret === 'change-me') out.push('CALLBACK_SECRET must be a random string of at least 24 characters');
  if (!/^https:\/\//.test(c.callbackBase)) out.push('DARAJA_CALLBACK_BASE_URL must be a public https URL that Safaricom can reach');
  if (c.origins.includes('*')) out.push('ALLOWED_ORIGINS must list your web origin(s), not *');
  if (!c.initiatorName || !c.securityCredential) out.push('INITIATOR_NAME and SECURITY_CREDENTIAL are needed for cash out (B2C)');
  return out;
}
