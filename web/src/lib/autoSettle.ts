import { useEffect, useRef } from 'react'
import { useData } from './store'
import { useOnline } from './net'
import { settleItems } from './onchain'
import { isUnlocked } from './session'

/**
 * "Auto-settle when online": when enabled, submits payments this device holds as soon as it is online, at most once
 * per reconnect (and again when new payments arrive). Errors are swallowed; the user can still settle manually.
 */
export function useAutoSettle() {
  const { items, settings } = useData()
  const online = useOnline()
  const running = useRef(false)
  const tried = useRef<Set<string>>(new Set())
  const pending = items.filter((i) => i.source === 'received' && i.status === 'pending')
  const key = pending.map((i) => i.id).join(',')
  useEffect(() => {
    if (!online) tried.current.clear()
  }, [online])
  useEffect(() => {
    if (!settings.autoSettle || !online || running.current || !isUnlocked()) return
    const fresh = pending.filter((i) => !tried.current.has(i.id))
    if (fresh.length === 0) return
    running.current = true
    fresh.forEach((i) => tried.current.add(i.id))
    settleItems(fresh).catch(() => undefined).finally(() => { running.current = false })
  }, [settings.autoSettle, online, key])
}
