/**
 * End-to-end on-ramp check against a RUNNING ramp server (mock mode):
 *   terminal 1:  npm run dev          (or: npm start)
 *   terminal 2:  npm run e2e
 * Uses a throwaway wallet. Signs the auth message, starts an M-Pesa on-ramp, polls until it completes,
 * then checks replay protection and that the phone number is masked in the order.
 */
import { Wallet } from 'ethers';
import { buildAuthMessage } from '../src/authMessage.js';

const BASE = (process.env.RAMP_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const j = async (path: string, init?: RequestInit) => {
  const r = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json' } });
  return { status: r.status, body: (await r.json()) as any };
};
const fail = (m: string): never => { console.error('FAIL', m); process.exit(1); };

const cfg = (await j('/api/ramp/config')).body;
console.log('config', cfg);
if (!cfg.mock) fail('server is not in mock mode; refusing to run against a real Daraja configuration');

const w = Wallet.createRandom();
const phone = '254712345678', kes = 1000, issuedAt = Date.now();
const signature = await w.signMessage(buildAuthMessage({ action: 'onramp', address: w.address, phone, amount: String(kes), issuedAt }));
const payload = { address: w.address, phone: '0712 345 678', amountKes: kes, issuedAt, signature };

const start = await j('/api/ramp/onramp/mpesa', { method: 'POST', body: JSON.stringify(payload) });
if (start.status !== 200) fail('start ' + JSON.stringify(start));
console.log('started', start.body);

const replay = await j('/api/ramp/onramp/mpesa', { method: 'POST', body: JSON.stringify(payload) });
if (replay.status !== 409) fail('replayed signature was not rejected: ' + replay.status);
console.log('replay rejected', replay.status);

const bad = await j('/api/ramp/onramp/mpesa', { method: 'POST', body: JSON.stringify({ ...payload, amountKes: 2000 }) });
if (bad.status !== 401) fail('tampered amount was not rejected: ' + bad.status);
console.log('tampered amount rejected', bad.status);

const t0 = Date.now();
let order: any;
for (;;) {
  order = (await j('/api/ramp/orders/' + start.body.id)).body;
  process.stdout.write(`  ${((Date.now() - t0) / 1000).toFixed(1)}s status=${order.status}\n`);
  if (order.status === 'completed' || order.status === 'failed') break;
  if (Date.now() - t0 > 60_000) fail('timed out waiting for completion');
  await new Promise((r) => setTimeout(r, 1000));
}
if (order.status !== 'completed') fail('order ended ' + order.status + ': ' + order.reason);
if (!/\*\*\*/.test(order.phoneMasked) || JSON.stringify(order).includes('712345678')) fail('phone not masked');
console.log('completed', order);
console.log('E2E ON-RAMP OK');
