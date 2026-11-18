import type { Address } from 'viem'
import { roleOf } from './items'
import type { Activity, StoredItem } from './store'

export interface HistoryRow {
  key: string
  ts: number
  /** Counterparty address, or a label for reserve moves. */
  who: string
  label?: string
  dir: 'in' | 'out' | 'self'
  amount: bigint
  status: 'pending' | 'settled' | 'failed' | 'relayed'
  rawStatus: string
  kind: 'voucher' | 'online' | 'deposit' | 'withdraw'
  item?: StoredItem
  txHash?: string
  carrying?: boolean
  note?: string
}

export function buildHistory(items: StoredItem[], activity: Activity[], me: Address | null): HistoryRow[] {
  const rows: HistoryRow[] = []
  for (const i of items) {
    const role = roleOf(i, me)
    const failed = ['duplicate', 'expired', 'invalid', 'cancelled'].includes(i.status)
    rows.push({
      key: `v:${i.id}`,
      ts: i.createdAt,
      who: role === 'in' ? i.from : i.to,
      dir: role === 'in' ? 'in' : 'out',
      amount: BigInt(i.amount),
      status: i.status === 'settled' ? 'settled' : failed ? 'failed' : role === 'courier' ? 'relayed' : 'pending',
      rawStatus: i.status,
      kind: 'voucher',
      item: i,
      txHash: i.txHash,
      carrying: role === 'courier',
      note: i.note,
    })
  }
  for (const a of activity) {
    rows.push({
      key: `a:${a.id}`,
      ts: a.ts,
      who: a.to ?? (a.type === 'deposit' ? 'Offline reserve' : 'Wallet'),
      label: a.type === 'deposit' ? 'Added to reserve' : a.type === 'withdraw' ? 'Withdrawn from reserve' : undefined,
      dir: a.type === 'online' ? 'out' : 'self',
      amount: BigInt(a.amount),
      status: 'settled',
      rawStatus: 'settled',
      kind: a.type === 'online' ? 'online' : a.type === 'deposit' ? 'deposit' : 'withdraw',
      txHash: a.txHash,
    })
  }
  return rows.sort((x, y) => y.ts - x.ts)
}
