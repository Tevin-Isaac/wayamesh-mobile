/**
 * Wallet session: pending (created/imported, no PIN yet) -> locked (vault on disk) -> unlocked (account in memory).
 * The decrypted secret exists only in this module's memory while unlocked and is dropped on lock / sign-out.
 */
import { useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { accountFromSecret, newMnemonic, parseSecret, type Account, type Secret } from './identity'
import {
  clearFailures,
  clearVault,
  decryptSecret,
  encryptSecret,
  isVaultRecord,
  loadVault,
  lockoutRemainingSeconds,
  pinProblem,
  recordFailure,
  saveVault,
} from './vault'
import { bindStore, getData, wipeStore } from './store'

export type SessionStatus = 'none' | 'pending' | 'locked' | 'unlocked'

export interface SessionSnapshot {
  status: SessionStatus
  address: Address | null
  /** True when the unlocked wallet came from a seed phrase (so a phrase can be shown for backup). */
  hasMnemonic: boolean
}

let status: SessionStatus = 'none'
let address: Address | null = null
let account: Account | null = null
let pending: Secret | null = null
let hasMnemonic = false
let freshPhrase: string | null = null
let snapshot: SessionSnapshot = { status, address, hasMnemonic }
const listeners = new Set<() => void>()
let idleTimer: ReturnType<typeof setTimeout> | null = null

function emit() {
  snapshot = { status, address, hasMnemonic }
  listeners.forEach((l) => l())
}

function init() {
  const v = loadVault()
  if (v) {
    status = 'locked'
    address = v.address
    snapshot = { status, address, hasMnemonic }
  }
}
init()

export function getSession(): SessionSnapshot {
  return snapshot
}

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getSession,
    getSession,
  )
}

export class LockedError extends Error {
  constructor() {
    super('The wallet is locked.')
  }
}

export function getAccount(): Account {
  if (!account) throw new LockedError()
  return account
}

export function isUnlocked() {
  return status === 'unlocked'
}

// ---- onboarding ----

/** Generates a fresh 12-word seed phrase held in memory only until a PIN seals it. */
export function startCreate(words: 12 | 24 = 12): Address {
  if (loadVault()) throw new Error('A wallet already exists on this device. Sign out first to create a new one.')
  pending = { kind: 'mnemonic', value: newMnemonic(words) }
  const acc = accountFromSecret(pending)
  address = acc.address
  status = 'pending'
  hasMnemonic = true
  emit()
  return acc.address
}

/** Parses a private key or 12/24-word phrase and holds it pending a PIN. Throws a readable error if invalid. */
export function startImport(input: string): Address {
  if (loadVault()) throw new Error('A wallet already exists on this device. Sign out first to import another.')
  const secret = parseSecret(input)
  pending = secret
  const acc = accountFromSecret(secret)
  address = acc.address
  status = 'pending'
  hasMnemonic = secret.kind === 'mnemonic'
  emit()
  return acc.address
}

export function getPendingMnemonic(): string | null {
  return pending && pending.kind === 'mnemonic' ? pending.value : null
}

/** Seals the pending secret under the PIN and unlocks the wallet. */
export async function setPin(pin: string, iterations?: number): Promise<void> {
  const problem = pinProblem(pin)
  if (problem) throw new Error(problem)
  if (!pending) throw new Error('Wallet not found. Please try again.')
  const rec = await encryptSecret(pending, pin, iterations)
  saveVault(rec)
  clearFailures()
  account = accountFromSecret(pending)
  address = account.address
  hasMnemonic = pending.kind === 'mnemonic'
  freshPhrase = pending.kind === 'mnemonic' ? pending.value : null
  pending = null
  status = 'unlocked'
  bindStore(address)
  armIdle()
  emit()
}

// ---- unlock / lock ----

export type UnlockResult = { ok: true } | { ok: false; waitSeconds: number; reason: string }

export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  const wait = lockoutRemainingSeconds()
  if (wait > 0) return { ok: false, waitSeconds: wait, reason: 'Too many attempts.' }
  const rec = loadVault()
  if (!rec) return { ok: false, waitSeconds: 0, reason: 'No wallet on this device.' }
  try {
    const secret = await decryptSecret(rec, pin)
    account = accountFromSecret(secret)
    address = account.address
    hasMnemonic = secret.kind === 'mnemonic'
    status = 'unlocked'
    clearFailures()
    bindStore(address)
    armIdle()
    emit()
    return { ok: true }
  } catch {
    return { ok: false, waitSeconds: recordFailure(), reason: 'Wrong PIN.' }
  }
}

/** The phrase of a wallet created in this session, shown once on the backup screen right after the PIN step. */
export function getFreshPhrase(): string | null {
  return freshPhrase
}

export function clearFreshPhrase() {
  freshPhrase = null
}

export function lock() {
  if (status !== 'unlocked') return
  freshPhrase = null
  account = null
  status = 'locked'
  hasMnemonic = false
  bindStore(null)
  disarmIdle()
  emit()
}

/** Removes the wallet and every wallet-scoped record from this device. */
export function logout() {
  const prev = address
  freshPhrase = null
  account = null
  pending = null
  address = null
  hasMnemonic = false
  status = 'none'
  clearVault()
  wipeStore(prev)
  disarmIdle()
  emit()
}

/** Re-checks the PIN and returns the secret, for backups. Counts toward the lockout like unlock. */
export async function revealSecret(pin: string): Promise<Secret | null> {
  if (lockoutRemainingSeconds() > 0) return null
  const rec = loadVault()
  if (!rec) return null
  try {
    const s = await decryptSecret(rec, pin)
    clearFailures()
    return s
  } catch {
    recordFailure()
    return null
  }
}

// ---- encrypted backup file ----

export function exportBackup(): string | null {
  const rec = loadVault()
  return rec ? JSON.stringify(rec) : null
}

/** Restores a wallet from an exported backup, after proving the PIN opens it. */
export async function restoreBackup(json: string, pin: string): Promise<UnlockResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, waitSeconds: 0, reason: 'That is not a Wayamesh backup file.' }
  }
  if (!isVaultRecord(parsed)) return { ok: false, waitSeconds: 0, reason: 'That is not a Wayamesh backup file.' }
  const wait = lockoutRemainingSeconds()
  if (wait > 0) return { ok: false, waitSeconds: wait, reason: 'Too many attempts.' }
  try {
    await decryptSecret(parsed, pin)
  } catch {
    return { ok: false, waitSeconds: recordFailure(), reason: 'Wrong PIN.' }
  }
  saveVault(parsed)
  return unlockWithPin(pin)
}

// ---- auto lock ----

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

function armIdle() {
  disarmIdle()
  if (typeof window === 'undefined') return
  const minutes = getData().settings.autoLockMinutes
  if (!minutes || minutes <= 0) return
  const reset = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(lock, minutes * 60_000)
  }
  reset()
  ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
  stopListening = () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
}

let stopListening: (() => void) | null = null

function disarmIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  stopListening?.()
  stopListening = null
}

export function rearmIdle() {
  if (status === 'unlocked') armIdle()
}
