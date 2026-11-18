import { useCallback, useState } from 'react'
import { settleItems, type SettleResult } from './onchain'
import { formatUsdc } from './money'
import { toast } from '@/components/ui'
import type { StoredItem } from './store'

/** Settles payments held by this device (received or carried). Anyone online with a little USDC for gas can do it. */
export function useSettle() {
  const [busy, setBusy] = useState(false)
  const settle = useCallback(async (items: StoredItem[]): Promise<SettleResult | null> => {
    setBusy(true)
    try {
      const r = await settleItems(items)
      if (r.settled > 0) toast(`Settled ${r.settled} payment${r.settled === 1 ? '' : 's'} on Arc${r.tips > 0n ? ` · tip earned ${formatUsdc(r.tips)} USDC` : ''}.`)
      else toast('Nothing could be settled. Check the status on each payment.')
      return r
    } catch (e) {
      toast(explainTxError(e))
      return null
    } finally {
      setBusy(false)
    }
  }, [])
  return { settle, busy }
}

export function explainTxError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(msg)) {
    return 'Not enough USDC in this wallet to pay the network fee (Arc gas is paid in USDC). Add a little from the faucet.'
  }
  if (/User rejected|denied/i.test(msg)) return 'Cancelled.'
  const short = msg.split('\n')[0]
  return short.length > 160 ? `${short.slice(0, 157)}…` : short
}
