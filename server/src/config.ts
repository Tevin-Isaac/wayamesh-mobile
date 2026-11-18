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
  callbackBase: string; callbackSecret: string;
  initiatorName: string; securityCredential: string; b2cShortcode: string;
  rpcUrl: string; treasuryKey: string;
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
    callbackBase: e('DARAJA_CALLBACK_BASE_URL').replace(/\/$/, ''), callbackSecret: e('CALLBACK_SECRET', 'change-me'),
    initiatorName: e('INITIATOR_NAME'), securityCredential: e('SECURITY_CREDENTIAL'),
    b2cShortcode: e('B2C_SHORTCODE') || e('DARAJA_SHORTCODE'),
    rpcUrl: e('ARC_RPC_URL', 'https://rpc.testnet.arc.network'), treasuryKey: e('TREASURY_PRIVATE_KEY'),
    usdKes: Number(e('USD_KES_RATE', '129')), feeBps: Number(e('FEE_BPS', '100')),
    minKes: Number(e('MIN_KES', '10')), maxKes: Number(e('MAX_KES', '150000')),
    origins: e('ALLOWED_ORIGINS', '*').split(',').map((s) => s.trim()).filter(Boolean),
    dataFile: e('DATA_FILE', './data/orders.json'),
  };
}
