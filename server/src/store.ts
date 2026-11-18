import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export type Status = 'pending' | 'paid' | 'delivering' | 'completed' | 'failed';
export interface Order {
  id: string; kind: 'onramp' | 'offramp'; status: Status;
  address: string; phone: string; usdc: string; kes: number; mock: boolean;
  txHash?: string;            // onramp: payout hash; offramp: user's deposit hash
  refundTxHash?: string;
  mpesaReceipt?: string; reason?: string;
  checkoutRequestId?: string; originatorConversationId?: string;
  payoutClaimed?: boolean;
  createdAt: number; updatedAt: number;
}
interface Data { orders: Record<string, Order>; usedTx: Record<string, string>; }

/** Tiny JSON-file store. All mutations are synchronous, so claim operations are atomic within the process. */
export class Store {
  private d: Data = { orders: {}, usedTx: {} };
  constructor(private file: string | null) {
    if (file && existsSync(file)) this.d = JSON.parse(readFileSync(file, 'utf8'));
  }
  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.d));
    renameSync(tmp, this.file);
  }
  get(id: string) { return this.d.orders[id]; }
  find(pred: (o: Order) => boolean) { return Object.values(this.d.orders).find(pred); }
  put(o: Order) { o.updatedAt = Date.now(); this.d.orders[o.id] = o; this.save(); return o; }
  update(id: string, patch: Partial<Order>) {
    const o = this.d.orders[id]; if (!o) throw new Error('no such order');
    Object.assign(o, patch, { updatedAt: Date.now() }); this.save(); return o;
  }
  /** Atomically claim the one-and-only payout for an order. True exactly once. */
  claimPayout(id: string): boolean {
    const o = this.d.orders[id];
    if (!o || o.payoutClaimed) return false;
    o.payoutClaimed = true; this.save(); return true;
  }
  /** Reserve a deposit tx hash. False if already used. */
  useTx(hash: string, orderId: string): boolean {
    const k = hash.toLowerCase();
    if (this.d.usedTx[k]) return false;
    this.d.usedTx[k] = orderId; this.save(); return true;
  }
}
