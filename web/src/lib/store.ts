/**
 * Wallet-scoped app data (payments, contacts, chats, agent mandate, ramp orders), kept in localStorage under the
 * wallet address. Nothing here is a secret: the signing key lives only in the PIN-encrypted vault. Everything is
 * wiped on sign-out. Not synced anywhere: chat text is device-local, exactly as on the phone app.
 */
import { useSyncExternalStore } from 'react'
import type { Address, Hex } from 'viem'

export type ItemStatus = 'pending' | 'settled' | 'duplicate' | 'expired' | 'invalid' | 'cancelled'

export interface StoredItem {
  id: string
  /** `signed` was created on this device; `received` arrived by QR, pasted code or share. */
  source: 'signed' | 'received'
  from: Address
  to: Address
  amount: string
  fee: string
  nonce: string
  deadline: string
  ref: Hex
  signature: Hex
  createdAt: number
  status: ItemStatus
  txHash?: Hex
  note?: string
  /** Received payment above the user's offline acceptance limit. */
  risky?: boolean
  /** Courier tip (USDC base units) this device earned by settling the payment for someone else. */
  tip?: string
}

/** On-chain actions that are not vouchers: online sends, reserve deposits and withdrawals. */
export interface Activity {
  id: string
  type: 'online' | 'deposit' | 'withdraw' | 'incoming-settled'
  amount: string
  to?: Address
  txHash: Hex
  ts: number
}

export interface Contact {
  address: Address
  name: string
  addedAt: number
}

export interface ChatMessage {
  id: string
  peer: Address
  dir: 'in' | 'out'
  kind: 'text' | 'payment'
  body?: string
  amount?: string
  itemId?: string
  ts: number
}

export interface StoredPolicy {
  perTxLimit: string
  dailyLimit: string
  totalBudget: string
  allowlist: string[]
  expiresAt: number
  requireAllowlist: boolean
}

export interface AgentStateStored {
  spentToday: string
  spentTotal: string
  dayAnchor: number
}

export interface AuditEntry {
  id: string
  ts: number
  kind: 'proposal' | 'execution'
  to: string
  amount: string
  allowed: boolean
  reason: string
}

export interface Instruction {
  id: string
  label: string
  to: Address
  amount: string
  intervalSeconds: number
  nextRun: number
  status: 'active' | 'paused' | 'done'
  runs: number
}

export interface OrderRef {
  id: string
  kind: 'onramp' | 'offramp'
  status: string
  usdc: string
  kes: string
  ts: number
}

export interface Settings {
  autoSettle: boolean
  acceptLimit: string
  autoLockMinutes: number
}

export interface Data {
  items: StoredItem[]
  activity: Activity[]
  contacts: Contact[]
  messages: ChatMessage[]
  agent: { policy: StoredPolicy | null; state: AgentStateStored | null; audit: AuditEntry[]; instructions: Instruction[] }
  orders: OrderRef[]
  settings: Settings
  cache: { reserve?: string; balance?: string; at?: number }
}

export const emptyData = (): Data => ({
  items: [],
  activity: [],
  contacts: [],
  messages: [],
  agent: { policy: null, state: null, audit: [], instructions: [] },
  orders: [],
  settings: { autoSettle: false, acceptLimit: '25', autoLockMinutes: 5 },
  cache: {},
})

const PREFIX = 'wayamesh.data.v1:'
export const LANG_KEY = 'wayamesh.lang'

let boundAddress: string | null = null
let data: Data = emptyData()
const listeners = new Set<() => void>()

function load(address: string): Data {
  try {
    const raw = localStorage.getItem(PREFIX + address.toLowerCase())
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Data>
      const base = emptyData()
      return {
        ...base,
        ...parsed,
        agent: { ...base.agent, ...(parsed.agent ?? {}) },
        settings: { ...base.settings, ...(parsed.settings ?? {}) },
        cache: { ...(parsed.cache ?? {}) },
      }
    }
  } catch {
    /* unreadable: start fresh */
  }
  return emptyData()
}

function persist() {
  if (!boundAddress) return
  try {
    localStorage.setItem(PREFIX + boundAddress.toLowerCase(), JSON.stringify(data))
  } catch {
    /* quota or private mode: keep working in memory */
  }
}

function emit() {
  listeners.forEach((l) => l())
}

/** Called by the session when a wallet unlocks (address) or locks / signs out (null). */
export function bindStore(address: string | null) {
  boundAddress = address
  data = address ? load(address) : emptyData()
  emit()
}

export function wipeStore(address: string | null) {
  try {
    if (address) localStorage.removeItem(PREFIX + address.toLowerCase())
    // belt and braces: remove any wallet data prefix left by earlier wallets
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
  boundAddress = null
  data = emptyData()
  emit()
}

export function getData(): Data {
  return data
}

export function useData(): Data {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getData,
    getData,
  )
}

function commit(next: Data) {
  data = next
  persist()
  emit()
}

// ---- mutations ----

export function addItem(item: StoredItem): boolean {
  if (data.items.some((i) => i.id === item.id)) return false
  commit({ ...data, items: [item, ...data.items] })
  return true
}

export function updateItem(id: string, patch: Partial<StoredItem>) {
  commit({ ...data, items: data.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
}

export function addActivity(a: Omit<Activity, 'id' | 'ts'> & { ts?: number }) {
  const entry: Activity = { id: `${a.txHash}:${a.type}`, ts: a.ts ?? Date.now(), ...a }
  if (data.activity.some((x) => x.id === entry.id)) return
  commit({ ...data, activity: [entry, ...data.activity].slice(0, 300) })
}

export function upsertContact(c: Contact) {
  const rest = data.contacts.filter((x) => x.address.toLowerCase() !== c.address.toLowerCase())
  commit({ ...data, contacts: [c, ...rest] })
}

export function getContact(address: string): Contact | undefined {
  return data.contacts.find((c) => c.address.toLowerCase() === address.toLowerCase())
}

export function addMessage(m: Omit<ChatMessage, 'id' | 'ts'>) {
  const msg: ChatMessage = { ...m, id: crypto.randomUUID(), ts: Date.now() }
  commit({ ...data, messages: [...data.messages, msg] })
}

export function setSettings(patch: Partial<Settings>) {
  commit({ ...data, settings: { ...data.settings, ...patch } })
}

export function setCache(patch: Partial<Data['cache']>) {
  commit({ ...data, cache: { ...data.cache, ...patch, at: Date.now() } })
}

export function setAgent(patch: Partial<Data['agent']>) {
  commit({ ...data, agent: { ...data.agent, ...patch } })
}

export function upsertOrder(o: OrderRef) {
  commit({ ...data, orders: [o, ...data.orders.filter((x) => x.id !== o.id)].slice(0, 50) })
}

export function getLanguage(): string {
  try {
    return localStorage.getItem(LANG_KEY) ?? 'en'
  } catch {
    return 'en'
  }
}
