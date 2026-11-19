import { describe, it, expect, vi } from 'vitest';
import { Wallet, parseUnits, Interface, ZeroHash } from 'ethers';
import type { AddressInfo } from 'node:net';
import { buildAuthMessage } from '../src/authMessage.js';
import { loadConfig, unsafeConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { MockDaraja, RealDaraja } from '../src/daraja.js';
import { RampService, redact, maskPhone } from '../src/ramp.js';
import { verifyDeposit, verifyVoucherDeposit, type DepositChain, type Treasury } from '../src/treasury.js';
import { createApp } from '../src/server.js';

const iface = new Interface(['event Settled(address indexed from, address indexed to, bytes32 indexed ref, uint256 nonce, uint256 amount, uint256 fee, address relayer)']);
const user = Wallet.createRandom();
const meshpay = Wallet.createRandom().address;
const hash = '0x' + 'cd'.repeat(32);

function setup(chain: Partial<DepositChain>, extraEnv: Record<string, string> = {}) {
  const cfg = loadConfig({ MPESA_MODE: 'mock', MESHPAY_ADDRESS: meshpay, ...extraEnv } as any);
  const sends: [string, string][] = [];
  const treasury: Treasury = { address: Wallet.createRandom().address, mock: false, sendUsdc: vi.fn(async (to, usdc) => { sends.push([to, usdc]); return { txHash: '0x' + 'a'.repeat(64), mock: false }; }) };
  const fullChain: DepositChain = { getTransaction: async () => null, getReceipt: async () => null, waitReceipt: async () => null, ...chain };
  const store = new Store(null);
  const ramp = new RampService({ cfg, store, daraja: new MockDaraja(), treasury, chain: fullChain, mockDelayMs: { stk: 1e9, b2c: 1e9 } });
  return { cfg, ramp, store, treasury, sends };
}
const offramp = async (ramp: RampService, usdc: string, deposit: 'voucher' | 'native', txHash = hash) => {
  const issuedAt = Date.now() + Math.floor(Math.random() * 100000);
  const signature = await user.signMessage(buildAuthMessage({ action: 'offramp', address: user.address, phone: '254712345678', amount: usdc, issuedAt }));
  return ramp.startOfframp({ address: user.address, phone: '0712345678', usdc, txHash, deposit, issuedAt, signature });
};

describe('voucher cash out through the service (paid from the MeshPay reserve)', () => {
  const logsFor = (treasury: string, from = user.address, to = treasury, amt = parseUnits('5', 6)) => {
    const e = iface.encodeEventLog('Settled', [from, to, ZeroHash, 1n, amt, 0n, user.address]);
    return [{ address: meshpay, topics: e.topics, data: e.data }];
  };
  it('pays out once, then rejects the same settlement hash being reused', async () => {
    const m = setup({});
    (m.ramp as any).d.chain.getReceipt = async () => ({ status: 1, blockNumber: 1 });
    (m.ramp as any).d.chain.getLogs = async () => logsFor(m.treasury.address!);
    const r = await offramp(m.ramp, '5', 'voucher');
    expect(r.status).toBe('delivering');
    await expect(offramp(m.ramp, '5', 'voucher')).rejects.toThrow(/already used/);
    await expect(offramp(m.ramp, '5', 'native')).rejects.toThrow(/already used|not found/);
  });
  it('rejects wrong from, wrong to, wrong amount via the service and starts no payout', async () => {
    const m = setup({});
    const c = (m.ramp as any).d.chain as DepositChain;
    c.getReceipt = async () => ({ status: 1, blockNumber: 1 });
    const other = Wallet.createRandom().address;
    for (const logs of [logsFor(m.treasury.address!, other), logsFor(m.treasury.address!, user.address, other), logsFor(m.treasury.address!, user.address, m.treasury.address!, parseUnits('4.99', 6))]) {
      c.getLogs = async () => logs;
      await expect(offramp(m.ramp, '5', 'voucher')).rejects.toThrow(/no matching payment/);
    }
    expect(m.store.all()).toHaveLength(0);
  });
  it('rejects a settlement that is not mined (both deposit kinds)', async () => {
    const treasury = Wallet.createRandom().address;
    const chain: DepositChain = { getTransaction: async () => ({ from: user.address, to: treasury, value: parseUnits('5', 18) }), getReceipt: async () => null, waitReceipt: async () => null, getLogs: async () => [] };
    expect(await verifyVoucherDeposit(chain, { txHash: hash, from: user.address, treasury, usdc: '5', meshpay })).toEqual({ ok: false, reason: 'transaction not confirmed yet' });
    expect(await verifyDeposit(chain, { txHash: hash, from: user.address, treasury, usdc: '5' })).toEqual({ ok: false, reason: 'transaction not confirmed yet' });
  });
});

describe('config and hardening', () => {
  it('MPESA_TX_TYPE selects the STK transaction type (default paybill)', async () => {
    expect(loadConfig({} as any).txType).toBe('paybill');
    expect(loadConfig({ MPESA_TX_TYPE: 'till' } as any).txType).toBe('till');
    expect(loadConfig({ MPESA_TX_TYPE: 'garbage' } as any).txType).toBe('paybill');
    const creds = { DARAJA_CONSUMER_KEY: 'k', DARAJA_CONSUMER_SECRET: 's', DARAJA_SHORTCODE: '174379', DARAJA_PASSKEY: 'p', DARAJA_CALLBACK_BASE_URL: 'https://x.example', CALLBACK_SECRET: 'z'.repeat(30) };
    const bodies: any[] = [];
    const urls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (u: any, init: any) => {
      urls.push(String(u));
      if (String(u).includes('oauth')) return new Response(JSON.stringify({ access_token: 't', expires_in: '3599' }));
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ResponseCode: '0', CheckoutRequestID: 'ws_CO_1' }));
    }) as any;
    try {
      for (const t of ['paybill', 'till']) {
        const d = new RealDaraja(loadConfig({ ...creds, MPESA_MODE: 'sandbox', MPESA_TX_TYPE: t } as any));
        await d.stkPush({ phone: '254712345678', amountKes: 10, ref: 'r' });
      }
      expect(bodies.map((b) => b.TransactionType)).toEqual(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']);
      const d = new RealDaraja(loadConfig({ ...creds, MPESA_MODE: 'sandbox', INITIATOR_NAME: 'i', SECURITY_CREDENTIAL: 'c' } as any));
      await d.b2c({ phone: '254712345678', amountKes: 10, ref: 'r' });
      expect(urls.some((u) => u.endsWith('/mpesa/b2c/v1/paymentrequest'))).toBe(true);
      expect(urls.some((u) => u.endsWith('/mpesa/stkpush/v1/processrequest'))).toBe(true);
    } finally { globalThis.fetch = realFetch; }
  });
  it('refuses unsafe non-mock configuration', () => {
    const creds = { DARAJA_CONSUMER_KEY: 'k', DARAJA_CONSUMER_SECRET: 's', DARAJA_SHORTCODE: '1', DARAJA_PASSKEY: 'p' };
    expect(unsafeConfig(loadConfig({ MPESA_MODE: 'mock' } as any))).toEqual([]);
    const bad = unsafeConfig(loadConfig({ ...creds } as any));
    expect(bad.length).toBeGreaterThanOrEqual(4);
    const good = unsafeConfig(loadConfig({ ...creds, CALLBACK_SECRET: 'x'.repeat(32), DARAJA_CALLBACK_BASE_URL: 'https://r.example', ALLOWED_ORIGINS: 'https://wayamesh.xyz', INITIATOR_NAME: 'i', SECURITY_CREDENTIAL: 'c' } as any));
    expect(good).toEqual([]);
  });
  it('MAX_KES caps on-ramp amounts', async () => {
    const m = setup({}, { MAX_KES: '500' });
    const issuedAt = Date.now();
    const signature = await user.signMessage(buildAuthMessage({ action: 'onramp', address: user.address, phone: '254712345678', amount: '501', issuedAt }));
    await expect(m.ramp.startOnramp({ address: user.address, phone: '0712345678', amountKes: 501, issuedAt, signature })).rejects.toThrow(/between 10 and 500/);
  });
  it('redacts phones, long hex and webhook tokens from log text; masks phones in orders', () => {
    expect(redact('failed for 254712345678 and +254712345678')).not.toMatch(/712345678/);
    expect(redact('key 0x' + 'ab'.repeat(32))).not.toMatch(/abab/);
    expect(redact('https://x/cb?token=SECRET123&a=1')).not.toMatch(/SECRET123/);
    expect(maskPhone('254712345678')).toBe('254712***678');
  });
  it('webhooks need the callback secret token in every mode', async () => {
    const m = setup({}, { CALLBACK_SECRET: 'sekret-token-1234567890abcd' });
    const srv = createApp(m.cfg, m.ramp);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const post = (q: string) => fetch(`${base}/api/ramp/mpesa/callback${q}`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
      expect((await post('')).status).toBe(403);
      expect((await post('?token=wrong')).status).toBe(403);
      expect((await post('?token=sekret-token-1234567890abcd')).status).toBe(200);
    } finally { srv.close(); }
  });
  it('replayed callbacks do not pay twice (idempotent)', async () => {
    const m = setup({});
    const issuedAt = Date.now();
    const signature = await user.signMessage(buildAuthMessage({ action: 'onramp', address: user.address, phone: '254712345678', amount: '1290', issuedAt }));
    const r = await m.ramp.startOnramp({ address: user.address, phone: '0712345678', amountKes: 1290, issuedAt, signature });
    const cb = { Body: { stkCallback: { CheckoutRequestID: m.store.get(r.id).checkoutRequestId, ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1290 }] } } } };
    await Promise.all([m.ramp.onStkCallback(cb), m.ramp.onStkCallback(cb), m.ramp.onStkCallback(cb)]);
    expect(m.sends).toHaveLength(1);
  });
});
