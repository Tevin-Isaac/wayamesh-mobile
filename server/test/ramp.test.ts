import { describe, it, expect, vi } from 'vitest';
import { Wallet, parseUnits, Interface, ZeroHash } from 'ethers';
import { normalizePhone, buildAuthMessage } from '../src/authMessage.js';
import { verifyAuth } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { MockDaraja } from '../src/daraja.js';
import { RampService, kesToUsdc, usdcToKes } from '../src/ramp.js';
import { verifyDeposit, verifyVoucherDeposit, type DepositChain, type Treasury } from '../src/treasury.js';

describe('phone', () => {
  it('normalises', () => {
    for (const p of ['0712345678', '+254712345678', '254712345678', '712345678', '0712 345 678']) expect(normalizePhone(p)).toBe('254712345678');
    expect(normalizePhone('0112345678')).toBe('254112345678');
  });
  it('rejects', () => {
    for (const p of ['', '12345', '0212345678', '+255712345678', 'abc']) expect(normalizePhone(p)).toBeNull();
  });
});

const w = Wallet.createRandom();
const sign = async (action: 'onramp' | 'offramp', amount: string, issuedAt = Date.now(), signer = w, phone = '254712345678') =>
  signer.signMessage(buildAuthMessage({ action, address: w.address, phone, amount, issuedAt }));

describe('auth', () => {
  it('accepts valid', async () => {
    const issuedAt = Date.now();
    const signature = await sign('onramp', '100', issuedAt);
    expect(verifyAuth({ action: 'onramp', address: w.address, phone: '254712345678', amount: '100', issuedAt, signature })).toBe(w.address);
  });
  it('rejects expired', async () => {
    const issuedAt = Date.now() - 6 * 60_000;
    const signature = await sign('onramp', '100', issuedAt);
    expect(() => verifyAuth({ action: 'onramp', address: w.address, phone: '254712345678', amount: '100', issuedAt, signature })).toThrow(/expired/);
  });
  it('rejects wrong signer', async () => {
    const issuedAt = Date.now();
    const signature = await sign('onramp', '100', issuedAt, Wallet.createRandom());
    expect(() => verifyAuth({ action: 'onramp', address: w.address, phone: '254712345678', amount: '100', issuedAt, signature })).toThrow(/signer/);
  });
  it('rejects tampered amount', async () => {
    const issuedAt = Date.now();
    const signature = await sign('onramp', '100', issuedAt);
    expect(() => verifyAuth({ action: 'onramp', address: w.address, phone: '254712345678', amount: '999', issuedAt, signature })).toThrow();
  });
});

describe('pricing', () => {
  const c = loadConfig({ USD_KES_RATE: '129', FEE_BPS: '100' } as any);
  it('converts', () => {
    expect(kesToUsdc(c, 1290)).toBe('9.900000');
    expect(usdcToKes(c, '10')).toBe(1277);
  });
});

function mk() {
  const cfg = loadConfig({ MPESA_MODE: 'mock' } as any);
  const sends: [string, string][] = [];
  const treasury: Treasury = { address: Wallet.createRandom().address, mock: false, sendUsdc: vi.fn(async (to, usdc) => { sends.push([to, usdc]); return { txHash: '0x' + 'a'.repeat(64), mock: false }; }) };
  const chain: DepositChain = { getTransaction: vi.fn(), getReceipt: vi.fn(), waitReceipt: vi.fn() };
  const store = new Store(null);
  const ramp = new RampService({ cfg, store, daraja: new MockDaraja(), treasury, chain, mockDelayMs: { stk: 1e9, b2c: 1e9 } });
  return { ramp, store, sends, treasury, chain, cfg };
}

describe('idempotent payout', () => {
  it('pays out once on duplicate callbacks', async () => {
    const { ramp, store, sends } = mk();
    const issuedAt = Date.now();
    const signature = await sign('onramp', '1290', issuedAt);
    const r = await ramp.startOnramp({ address: w.address, phone: '0712345678', amountKes: 1290, issuedAt, signature });
    expect(r.mock).toBe(true);
    const o = store.get(r.id);
    const cb = { Body: { stkCallback: { CheckoutRequestID: o.checkoutRequestId, ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1290 }, { Name: 'MpesaReceiptNumber', Value: 'X1' }] } } } };
    await Promise.all([ramp.onStkCallback(cb), ramp.onStkCallback(cb)]);
    await ramp.onStkCallback(cb);
    expect(sends).toHaveLength(1);
    expect(sends[0]).toEqual([w.address, '9.900000']);
    expect(ramp.getOrder(r.id)).toMatchObject({ status: 'completed', phoneMasked: '254712***678' });
  });
  it('rejects replayed signature', async () => {
    const { ramp } = mk();
    const issuedAt = Date.now();
    const signature = await sign('onramp', '100', issuedAt);
    const body = { address: w.address, phone: '0712345678', amountKes: 100, issuedAt, signature };
    await ramp.startOnramp(body);
    await expect(ramp.startOnramp(body)).rejects.toThrow(/already used/);
  });
});

describe('offramp deposit verification', () => {
  const treasury = Wallet.createRandom().address;
  const hash = '0x' + 'b'.repeat(64);
  const good = { from: w.address, to: treasury, value: parseUnits('5', 18) };
  const mkChain = (tx: any, rc: any): DepositChain => ({ getTransaction: async () => tx, getReceipt: async () => rc, waitReceipt: async () => rc });
  const a = { txHash: hash, from: w.address, treasury, usdc: '5' };
  it('ok', async () => expect(await verifyDeposit(mkChain(good, { status: 1, blockNumber: 1 }), a)).toEqual({ ok: true }));
  it('wrong to', async () => expect((await verifyDeposit(mkChain({ ...good, to: w.address }, { status: 1, blockNumber: 1 }), a)).ok).toBe(false));
  it('wrong from', async () => expect((await verifyDeposit(mkChain({ ...good, from: treasury }, { status: 1, blockNumber: 1 }), a)).ok).toBe(false));
  it('wrong value', async () => expect((await verifyDeposit(mkChain({ ...good, value: 1n }, { status: 1, blockNumber: 1 }), a)).ok).toBe(false));
  it('reverted', async () => expect((await verifyDeposit(mkChain(good, { status: 0, blockNumber: 1 }), a)).ok).toBe(false));
  it('unconfirmed', async () => expect((await verifyDeposit(mkChain(good, null), a)).ok).toBe(false));
  it('missing', async () => expect((await verifyDeposit(mkChain(null, null), a)).ok).toBe(false));

  it('service rejects reused tx hash', async () => {
    const m = mk();
    (m.chain.getTransaction as any).mockResolvedValue({ from: w.address, to: m.treasury.address, value: parseUnits('5', 18) });
    (m.chain.getReceipt as any).mockResolvedValue({ status: 1, blockNumber: 1 });
    const go = async () => {
      const issuedAt = Date.now() + Math.floor(Math.random() * 1000);
      const signature = await sign('offramp', '5', issuedAt);
      return m.ramp.startOfframp({ address: w.address, phone: '0712345678', usdc: '5', txHash: hash, issuedAt, signature });
    };
    const r = await go();
    expect(r.status).toBe('delivering');
    await expect(go()).rejects.toThrow(/already used/);
  });
});

describe('offramp voucher deposit verification (paid from the MeshPay reserve)', () => {
  const iface = new Interface(['event Settled(address indexed from, address indexed to, bytes32 indexed ref, uint256 nonce, uint256 amount, uint256 fee, address relayer)']);
  const meshpay = Wallet.createRandom().address;
  const treasury = Wallet.createRandom().address;
  const user = Wallet.createRandom().address;
  const hash = '0x' + 'ab'.repeat(32);
  const chainWith = (logs: any[], status = 1): DepositChain => ({
    getTransaction: async () => null,
    getReceipt: async () => ({ status, blockNumber: 1 }),
    waitReceipt: async () => ({ status, blockNumber: 1 }),
    getLogs: async () => logs,
  });
  const logFor = (from: string, to: string, amount: bigint, address = meshpay) => {
    const e = iface.encodeEventLog('Settled', [from, to, ZeroHash, 1n, amount, 0n, user]);
    return { address, topics: e.topics, data: e.data };
  };
  const args = { txHash: hash, from: user, treasury, usdc: '2.5', meshpay };
  it('accepts a matching Settled event', async () => {
    expect((await verifyVoucherDeposit(chainWith([logFor(user, treasury, parseUnits('2.5', 6))]), args)).ok).toBe(true);
  });
  it('rejects wrong payer, wrong recipient, wrong amount, wrong contract, failed tx, not enabled', async () => {
    const amt = parseUnits('2.5', 6);
    const other = Wallet.createRandom().address;
    expect((await verifyVoucherDeposit(chainWith([logFor(other, treasury, amt)]), args)).ok).toBe(false);
    expect((await verifyVoucherDeposit(chainWith([logFor(user, other, amt)]), args)).ok).toBe(false);
    expect((await verifyVoucherDeposit(chainWith([logFor(user, treasury, amt - 1n)]), args)).ok).toBe(false);
    expect((await verifyVoucherDeposit(chainWith([logFor(user, treasury, amt, other)]), args)).ok).toBe(false);
    expect((await verifyVoucherDeposit(chainWith([logFor(user, treasury, amt)], 0), args)).ok).toBe(false);
    expect((await verifyVoucherDeposit(chainWith([logFor(user, treasury, amt)]), { ...args, meshpay: '' })).ok).toBe(false);
  });
});
