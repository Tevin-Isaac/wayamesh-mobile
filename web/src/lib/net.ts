import { useSyncExternalStore } from 'react'

let online = typeof navigator === 'undefined' ? true : navigator.onLine
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    online = true
    listeners.forEach((l) => l())
  })
  window.addEventListener('offline', () => {
    online = false
    listeners.forEach((l) => l())
  })
}

export const getOnline = () => online

export function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => online,
    () => true,
  )
}
