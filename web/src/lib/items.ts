import type { Address } from 'viem'
import { voucherId, type Payment, type Voucher } from './mesh'
import type { StoredItem } from './store'

export function toPayment(i: StoredItem): Payment {
  return {
    from: i.from,
    to: i.to,
    amount: BigInt(i.amount),
    fee: BigInt(i.fee ?? '0'),
    nonce: BigInt(i.nonce),
    deadline: BigInt(i.deadline),
    ref: i.ref,
  }
}

export const toVoucher = (i: StoredItem): Voucher => ({ payment: toPayment(i), signature: i.signature })

export function makeItem(v: Voucher, source: StoredItem['source']): StoredItem {
  const p = v.payment
  return {
    id: voucherId(p),
    source,
    from: p.from,
    to: p.to,
    amount: p.amount.toString(),
    fee: p.fee.toString(),
    nonce: p.nonce.toString(),
    deadline: p.deadline.toString(),
    ref: p.ref,
    signature: v.signature,
    createdAt: Date.now(),
    status: 'pending',
  }
}

export type Role = 'out' | 'in' | 'courier'

/** `out`: I paid. `in`: addressed to me. `courier`: I am only carrying someone else's payment. */
export function roleOf(i: StoredItem, me: Address | null): Role {
  if (i.source === 'signed') return 'out'
  return me && i.to.toLowerCase() === me.toLowerCase() ? 'in' : 'courier'
}
