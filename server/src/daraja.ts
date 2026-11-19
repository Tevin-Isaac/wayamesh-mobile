import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';

export interface StkResult { checkoutRequestId: string; mock: boolean }
export interface B2cResult { originatorConversationId: string; mock: boolean }
export interface Daraja {
  stkPush(a: { phone: string; amountKes: number; ref: string }): Promise<StkResult>;
  b2c(a: { phone: string; amountKes: number; ref: string }): Promise<B2cResult>;
}

export function timestamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
export const stkPassword = (shortcode: string, passkey: string, ts: string) =>
  Buffer.from(shortcode + passkey + ts).toString('base64');

export class MockDaraja implements Daraja {
  async stkPush() { return { checkoutRequestId: 'mock_ws_CO_' + randomUUID(), mock: true }; }
  async b2c() { return { originatorConversationId: 'mock_b2c_' + randomUUID(), mock: true }; }
}

export class RealDaraja implements Daraja {
  private token: { v: string; exp: number } | null = null;
  constructor(private c: Config) {}
  private get base() {
    return this.c.mode === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  }
  private async getToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.v;
    const auth = Buffer.from(`${this.c.consumerKey}:${this.c.consumerSecret}`).toString('base64');
    const r = await fetch(`${this.base}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
    if (!r.ok) throw new Error(`daraja oauth ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in: string };
    this.token = { v: j.access_token, exp: Date.now() + Number(j.expires_in) * 1000 };
    return j.access_token;
  }
  private async post(path: string, body: unknown) {
    const r = await fetch(this.base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, any>;
    if (!r.ok) throw new Error(`daraja ${path} ${r.status}: ${j.errorMessage ?? j.ResponseDescription ?? 'error'}`);
    return j;
  }
  private cb(path: string) { return `${this.c.callbackBase}${path}?token=${encodeURIComponent(this.c.callbackSecret)}`; }

  async stkPush({ phone, amountKes, ref }: { phone: string; amountKes: number; ref: string }) {
    const ts = timestamp();
    const j = await this.post('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: this.c.shortcode,
      Password: stkPassword(this.c.shortcode, this.c.passkey, ts),
      Timestamp: ts,
      TransactionType: this.c.txType === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
      Amount: amountKes, PartyA: phone, PartyB: this.c.shortcode, PhoneNumber: phone,
      CallBackURL: this.cb('/api/ramp/mpesa/callback'),
      AccountReference: ref.slice(0, 12), TransactionDesc: 'Wayamesh USDC',
    });
    if (String(j.ResponseCode) !== '0') throw new Error('stk push rejected');
    return { checkoutRequestId: j.CheckoutRequestID as string, mock: false };
  }

  async b2c({ phone, amountKes, ref }: { phone: string; amountKes: number; ref: string }) {
    const originatorConversationId = randomUUID();
    const j = await this.post('/mpesa/b2c/v1/paymentrequest', {
      OriginatorConversationID: originatorConversationId,
      InitiatorName: this.c.initiatorName, SecurityCredential: this.c.securityCredential,
      CommandID: 'BusinessPayment', Amount: amountKes,
      PartyA: this.c.b2cShortcode, PartyB: phone,
      Remarks: 'Wayamesh cash out ' + ref.slice(0, 20), Occasion: ref.slice(0, 20),
      QueueTimeOutURL: this.cb('/api/ramp/mpesa/b2c/timeout'),
      ResultURL: this.cb('/api/ramp/mpesa/b2c/result'),
    });
    if (String(j.ResponseCode) !== '0') throw new Error('b2c rejected');
    return { originatorConversationId, mock: false };
  }
}
