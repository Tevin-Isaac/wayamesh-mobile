/**
 * Encryption at rest for the wallet secret (seed phrase or private key).
 *
 * The PIN is stretched with PBKDF2-SHA256 (600k iterations) into an AES-GCM key that seals the secret. The wallet
 * address is bound in as additional authenticated data. The PIN is never stored. Failed unlock attempts are
 * rate-limited (exponential lockout), but note the limit is client-side: someone who copies the encrypted blob can
 * brute-force offline, so a 6-digit PIN is a convenience lock, not a substitute for backing up the seed phrase.
 */
import { getAddress, type Address } from 'viem'
import { accountFromSecret, type Secret } from './identity'

export const PBKDF2_ITERATIONS = 600_000
export const VAULT_KEY = 'wayamesh.vault.v1'
const LOCK_KEY = 'wayamesh.attempts'

const enc = new TextEncoder()
const dec = new TextDecoder()

export interface VaultRecord {
  v: 1
  kdf: 'pbkdf2-sha256'
  address: Address
  salt: string
  iters: number
  iv: string
  ct: string
}

export function toB64(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => {
    s += String.fromCharCode(b)
  })
  return btoa(s)
}

export function fromB64(input: string): Uint8Array<ArrayBuffer> {
  const bin = atob(input)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n))
  crypto.getRandomValues(out)
  return out
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypts the secret under the PIN. `iterations` is overridable for fast tests only. */
export async function encryptSecret(secret: Secret, pin: string, iterations = PBKDF2_ITERATIONS): Promise<VaultRecord> {
  const address = getAddress(accountFromSecret(secret).address)
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(pin, salt, iterations)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(address) },
    key,
    enc.encode(JSON.stringify(secret)),
  )
  return { v: 1, kdf: 'pbkdf2-sha256', address, salt: toB64(salt), iters: iterations, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) }
}

/** Decrypts with the PIN. Throws on a wrong PIN or tampered record. */
export async function decryptSecret(rec: VaultRecord, pin: string): Promise<Secret> {
  const key = await deriveKey(pin, fromB64(rec.salt), rec.iters)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(rec.iv), additionalData: enc.encode(rec.address) },
    key,
    fromB64(rec.ct),
  )
  return JSON.parse(dec.decode(plain)) as Secret
}

export function isVaultRecord(x: unknown): x is VaultRecord {
  const r = x as VaultRecord
  return !!r && r.v === 1 && r.kdf === 'pbkdf2-sha256' && typeof r.address === 'string' && typeof r.salt === 'string' &&
    typeof r.iv === 'string' && typeof r.ct === 'string' && Number.isInteger(r.iters) && r.iters >= 1 && r.iters <= 5_000_000
}

export function loadVault(): VaultRecord | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return isVaultRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveVault(rec: VaultRecord) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(rec))
}

export function clearVault() {
  try {
    localStorage.removeItem(VAULT_KEY)
    localStorage.removeItem(LOCK_KEY)
  } catch {
    /* ignore */
  }
}

/** Rejects PINs that are too easy to guess. */
export function pinProblem(pin: string): string | null {
  if (pin.length < 6) return 'Use at least 6 characters.'
  if (/^\d+$/.test(pin)) {
    if (/^(\d)\1+$/.test(pin)) return 'Pick digits that are not all the same.'
    const asc = '01234567890123456789'
    const desc = '98765432109876543210'
    if (asc.includes(pin) || desc.includes(pin)) return 'Avoid simple runs like 123456.'
  }
  return null
}

interface Attempts {
  failed: number
  until: number
}

function readAttempts(): Attempts {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) ?? '') as Attempts
  } catch {
    return { failed: 0, until: 0 }
  }
}

/** Seconds until another PIN try is allowed. */
export function lockoutRemainingSeconds(now = Date.now()): number {
  return Math.max(0, Math.ceil((readAttempts().until - now) / 1000))
}

export function recordFailure(now = Date.now()): number {
  const a = readAttempts()
  const failed = (a.failed ?? 0) + 1
  const over = failed - 4
  const until = over > 0 ? now + Math.min(60 * 60 * 1000, 30_000 * 2 ** (over - 1)) : 0
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ failed, until }))
  } catch {
    /* ignore */
  }
  return Math.max(0, Math.ceil((until - now) / 1000))
}

export function clearFailures() {
  try {
    localStorage.removeItem(LOCK_KEY)
  } catch {
    /* ignore */
  }
}
