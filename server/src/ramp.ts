import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import type { Store, Order } from './store.js';
import type { Daraja } from './daraja.js';
import { verifyDeposit, verifyVoucherDeposit, type Treasury, type DepositChain } from './treasury.js';
import { verifyAuth } from './auth.js';
import { normalizePhone } from './authMessage.js';

export class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

/** Strip phone numbers, long hex (keys / hashes) and secrets from text before it is logged. */
export const redact = (t: unknown) =>
  String(t ?? '').replace(/\+?254\d{9}/g, '254*********').replace(/\b0x[0-9a-fA-F]{40,}\b/g, '0x…').replace(/token=[^&\s]+/g, 'token=…').slice(0, 300);

export const maskPhone = (p: string) => p.slice(0, 6) + '***' + p.slice(-3);

export interface Deps {
  cfg: Config; store: Store; daraja: Daraja; treasury: Treasury; chain: DepositChain;
  mockDelayMs?: { stk: number; b2c: number };
}

const rateScaled = (c: Config) => Math.round(c.usdKes * 10000);
/** KES -> USDC micro units after fee (integer math). */
export function kesToUsdc(c: Config, kes: number): string {
  const micro = (BigInt(kes) * 1_000_000n * BigInt(10000 - c.feeBps)) / BigInt(rateScaled(c));
  return fmtMicro(micro);
}
/** USDC (<=6dp string) -> KES after fee, floored. */
export function usdcToKes(c: Config, usdc: string): number {
  const micro = microOf(usdc);
  return Number((micro * BigInt(rateScaled(c)) * BigInt(10000 - c.feeBps)) / 100_000_000_000_000n);
}
const microOf = (s: string) => { const [i, f = ''] = s.split('.'); return BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, '0')); };
const fmtMicro = (m: bigint) => `${m / 1_000_000n}.${(m % 1_000_000n).toString().padStart(6, '0')}`;

export class RampService {
  private sigs = new Map<string, number>();
  constructor(private d: Deps) {}

  config() {
    const c = this.d.cfg;
    return {
      mock: c.mock, network: c.networkName, meshpay: c.meshpay || null, usdKes: c.usdKes, feeBps: c.feeBps,
      minKes: c.minKes, maxKes: c.maxKes, treasury: this.d.treasury.address,
      treasuryMock: this.d.treasury.mock,
    };
  }

  /**
   * Mock mode only. The simulated Safaricom callbacks are in-memory timers, so a restart would leave
   * pending mock orders waiting forever (the client polls until it gives up). Re-arm them on startup.
   */
  resumeMock() {
    if (!this.d.cfg.mock) return 0;
    let n = 0;
    for (const o of this.d.store.all()) {
      if (o.kind === 'onramp' && o.status === 'pending' && o.checkoutRequestId) {
        n++; const id = o.checkoutRequestId;
        setTimeout(() => void this.onStkCallback(mockStk(id, o.kes)), 1000);
      } else if (o.kind === 'offramp' && o.status === 'delivering' && o.originatorConversationId) {
        n++; const id = o.originatorConversationId;
        setTimeout(() => void this.onB2cResult(mockB2c(id, o.kes)), 1000);
      }
    }
    return n;
  }

  private noReplay(sig: string) {
    const now = Date.now();
    for (const [k, t] of this.sigs) if (t < now - 6 * 60_000) this.sigs.delete(k);
    if (this.sigs.has(sig)) throw new HttpError(409, 'signature already used');
    this.sigs.set(sig, now);
  }

  private auth(action: 'onramp' | 'offramp', b: any, amount: string) {
    const phone = normalizePhone(b.phone);
    if (!phone) throw new HttpError(400, 'invalid phone number');
    let address: string;
    try {
      address = verifyAuth({ action, address: String(b.address), phone, amount, issuedAt: Number(b.issuedAt), signature: String(b.signature) });
    } catch (e: any) { throw new HttpError(401, e.message); }
    this.noReplay(String(b.signature));
    return { phone, address };
  }

  async startOnramp(b: any) {
    const c = this.d.cfg;
    const kes = Number(b.amountKes);
    if (!Number.isInteger(kes) || kes < c.minKes || kes > c.maxKes) throw new HttpError(400, `amountKes must be an integer between ${c.minKes} and ${c.maxKes}`);
    const { phone, address } = this.auth('onramp', b, String(kes));
    const usdc = kesToUsdc(c, kes);
    if (usdc === '0.000000') throw new HttpError(400, 'amount too small');
    const id = randomUUID();
    const order: Order = { id, kind: 'onramp', status: 'pending', address, phone, usdc, kes, mock: c.mock, createdAt: Date.now(), updatedAt: Date.now() };
    this.d.store.put(order);
    try {
      const r = await this.d.daraja.stkPush({ phone, amountKes: kes, ref: id.slice(0, 8) });
      this.d.store.update(id, { checkoutRequestId: r.checkoutRequestId });
      if (c.mock) setTimeout(() => void this.onStkCallback(mockStk(r.checkoutRequestId, kes)), this.d.mockDelayMs?.stk ?? 5000);
    } catch (e: any) {
      this.d.store.update(id, { status: 'failed', reason: 'Could not send M-Pesa prompt' });
      console.error('stk push failed', id.slice(0, 8), redact(e.message));
    }
    return { id, status: this.d.store.get(id).status, mock: c.mock };
  }

  /** Handles a Safaricom STK result body. Idempotent. */
  async onStkCallback(body: any) {
    const cb = body?.Body?.stkCallback;
    const o = cb && this.d.store.find((x) => x.kind === 'onramp' && x.checkoutRequestId === cb.CheckoutRequestID);
    if (!o || o.status !== 'pending') return; // unknown or already processed
    if (Number(cb.ResultCode) !== 0) {
      this.d.store.update(o.id, { status: 'failed', reason: cb.ResultDesc || 'M-Pesa payment not completed' });
      return;
    }
    const items: any[] = cb.CallbackMetadata?.Item ?? [];
    const get = (n: string) => items.find((i) => i.Name === n)?.Value;
    if (get('Amount') !== undefined && Number(get('Amount')) !== o.kes) {
      this.d.store.update(o.id, { status: 'failed', reason: 'Paid amount mismatch — contact support' });
      return;
    }
    this.d.store.update(o.id, { status: 'paid', mpesaReceipt: get('MpesaReceiptNumber') });
    await this.deliver(o.id);
  }

  private async deliver(id: string) {
    if (!this.d.store.claimPayout(id)) return; // payout at most once
    const o = this.d.store.get(id);
    this.d.store.update(id, { status: 'delivering' });
    try {
      const r = await this.d.treasury.sendUsdc(o.address, o.usdc);
      this.d.store.update(id, { status: 'completed', txHash: r.txHash, mock: o.mock || r.mock });
    } catch (e: any) {
      console.error('payout failed', id.slice(0, 8), redact(e.message));
      this.d.store.update(id, { status: 'failed', reason: 'M-Pesa received but USDC delivery failed — support will resolve' });
    }
  }

  async startOfframp(b: any) {
    const c = this.d.cfg;
    const usdc = String(b.usdc);
    if (!/^\d+(\.\d{1,6})?$/.test(usdc)) throw new HttpError(400, 'invalid usdc amount (max 6 decimals)');
    const kes = usdcToKes(c, usdc);
    if (kes < c.minKes || kes > c.maxKes) throw new HttpError(400, `payout must be between ${c.minKes} and ${c.maxKes} KES`);
    const { phone, address } = this.auth('offramp', b, usdc);
    const treasury = this.d.treasury.address;
    if (!treasury) throw new HttpError(503, 'treasury not configured');
    const txHash = String(b.txHash);
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new HttpError(400, 'invalid tx hash');
    const v = b.deposit === 'voucher'
      ? await verifyVoucherDeposit(this.d.chain, { txHash, from: address, treasury, usdc, meshpay: c.meshpay })
      : await verifyDeposit(this.d.chain, { txHash, from: address, treasury, usdc });
    if (!v.ok) throw new HttpError(400, v.reason);
    const id = randomUUID();
    if (!this.d.store.useTx(txHash, id)) throw new HttpError(409, 'transaction already used');
    const order: Order = { id, kind: 'offramp', status: 'paid', address, phone, usdc, kes, mock: c.mock, txHash, createdAt: Date.now(), updatedAt: Date.now() };
    this.d.store.put(order);
    if (!this.d.store.claimPayout(id)) return { id, status: 'paid' };
    try {
      const r = await this.d.daraja.b2c({ phone, amountKes: kes, ref: id.slice(0, 8) });
      this.d.store.update(id, { status: 'delivering', originatorConversationId: r.originatorConversationId });
      if (c.mock) setTimeout(() => void this.onB2cResult(mockB2c(r.originatorConversationId, kes)), this.d.mockDelayMs?.b2c ?? 3000);
    } catch (e: any) {
      console.error('b2c failed', id.slice(0, 8), redact(e.message));
      await this.failAndRefund(id, 'Could not start M-Pesa payout');
    }
    return { id, status: this.d.store.get(id).status };
  }

  private async failAndRefund(id: string, reason: string) {
    const o = this.d.store.get(id);
    try {
      const r = await this.d.treasury.sendUsdc(o.address, o.usdc);
      this.d.store.update(id, { status: 'failed', reason: reason + ' — USDC refunded', refundTxHash: r.txHash });
    } catch {
      this.d.store.update(id, { status: 'failed', reason: reason + ' — refund pending, support will resolve' });
    }
  }

  async onB2cResult(body: any) {
    const r = body?.Result;
    const o = r && this.d.store.find((x) => x.kind === 'offramp' && x.originatorConversationId === r.OriginatorConversationID);
    if (!o || o.status !== 'delivering') return;
    if (Number(r.ResultCode) === 0) {
      this.d.store.update(o.id, { status: 'completed', mpesaReceipt: r.TransactionID });
    } else {
      await this.failAndRefund(o.id, r.ResultDesc || 'M-Pesa payout failed');
    }
  }

  onB2cTimeout(body: any) {
    const r = body?.Result;
    const o = r && this.d.store.find((x) => x.kind === 'offramp' && x.originatorConversationId === r.OriginatorConversationID);
    // Ambiguous: Safaricom may still pay. Do not auto-refund.
    if (o && o.status === 'delivering') this.d.store.update(o.id, { status: 'failed', reason: 'M-Pesa payout timed out — under review, no double payment will be made' });
  }

  getOrder(id: string) {
    const o = this.d.store.get(id);
    if (!o) throw new HttpError(404, 'order not found');
    return {
      id: o.id, kind: o.kind, status: o.status, usdc: o.usdc, kes: o.kes, phoneMasked: maskPhone(o.phone),
      ...(o.txHash && { txHash: o.txHash }), ...(o.mpesaReceipt && { mpesaReceipt: o.mpesaReceipt }),
      ...(o.reason && { reason: o.reason }), ...(o.refundTxHash && { refundTxHash: o.refundTxHash }), mock: o.mock,
    };
  }
}

const mockStk = (checkoutRequestId: string, kes: number) => ({
  Body: { stkCallback: { CheckoutRequestID: checkoutRequestId, ResultCode: 0, ResultDesc: 'mock ok',
    CallbackMetadata: { Item: [{ Name: 'Amount', Value: kes }, { Name: 'MpesaReceiptNumber', Value: 'MOCK' + Math.random().toString(36).slice(2, 10).toUpperCase() }] } } },
});
const mockB2c = (oc: string, _kes: number) => ({
  Result: { ResultCode: 0, ResultDesc: 'mock ok', OriginatorConversationID: oc, TransactionID: 'MOCK' + Math.random().toString(36).slice(2, 10).toUpperCase() },
});
