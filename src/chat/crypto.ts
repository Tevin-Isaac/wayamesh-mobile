/**
 * Wayamesh chat protocol, byte-compatible with the Wayamesh web wallet (docs/PORTING-TO-WAYAMESH-MOBILE.md, section 5).
 * Pure module: only @noble imports, no React Native, so it runs unchanged under node for the cross-compat tests.
 *
 *  - Identity is the WALLET key (secp256k1). No separate chat key.
 *  - Contact card  `mpc1:` + b64url(address(20) | compressed pubkey(33) | nameLen(1) | name(<=24, utf8))
 *  - Sealed box    ephemeral ECDH -> HKDF-SHA256(salt = ephPub | recipientPub, info "meshpay-chat-v1") -> XChaCha20-Poly1305
 *  - Inner JSON    {v:1,i,t,f,o,k,x?,a?,r?,c?,s}; `s` = EIP-191 signature by the wallet key over a digest of the content
 *  - Transport     Nostr kind 1059, tag ["p", recipient x-only pubkey], signed by a throwaway key; offline `mpm1:` codes
 */
import { schnorr, secp256k1 } from '@noble/curves/secp256k1'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex as nobleBytesToHex, hexToBytes as nobleHexToBytes, randomBytes } from '@noble/hashes/utils'

const te = new TextEncoder()
const td = new TextDecoder()
const INFO = te.encode('meshpay-chat-v1')

export const CARD_PREFIX = 'mpc1:'
export const MESSAGE_PREFIX = 'mpm1:'
export const RELAY_KIND = 1059
export const DEFAULT_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net']

/** Chat messages disappear 24 hours after they were created (client policy plus a NIP-40 tag on relay events). */
export const MESSAGE_TTL_SECONDS = 86_400
/** Largest clock error tolerated when judging a message's creation time. */
export const MAX_FUTURE_SECONDS = 86_400
export const MAX_RELAY_SKEW_SECONDS = 2 * 86_400
export const MAX_RELAY_CONTENT = 12_000
export const MAX_INNER_BYTES = 4096

/** '0x' prefixed lowercase hex. */
export type Hex = `0x${string}`
export type Address = `0x${string}`

// ---- hex / base64url ----

export function bytesToHex(b: Uint8Array): Hex {
  return `0x${nobleBytesToHex(b)}`
}
export function hexToBytes(h: string): Uint8Array {
  return nobleHexToBytes(h.startsWith('0x') ? h.slice(2) : h)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toB64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 !== undefined) out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 !== undefined) out += B64[b2 & 63]
  }
  return out
}

export function fromB64Url(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '')
  const out: number[] = []
  let acc = 0
  let bits = 0
  for (const ch of clean) {
    const v = B64.indexOf(ch)
    if (v < 0) throw new Error('Damaged code')
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
      acc &= (1 << bits) - 1
    }
  }
  return new Uint8Array(out)
}

// ---- addresses (EIP-55) ----

export function toChecksumAddress(address: string): Address {
  const lower = address.toLowerCase().replace(/^0x/, '')
  const hash = nobleBytesToHex(keccak_256(te.encode(lower)))
  let out = '0x'
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i]
  return out as Address
}

/** Same rule as viem's strict isAddress: all-lowercase or all-uppercase hex passes, mixed case must carry a valid checksum. */
export function isAddress(value: unknown): value is Address {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) return false
  const body = value.slice(2)
  if (body === body.toLowerCase()) return true
  return toChecksumAddress(value) === value
}

export function addressOfPubkey(pubkey: Hex | Uint8Array): Address {
  const bytes = typeof pubkey === 'string' ? hexToBytes(pubkey) : pubkey
  const uncompressed = secp256k1.ProjectivePoint.fromHex(bytes).toRawBytes(false)
  return toChecksumAddress(nobleBytesToHex(keccak_256(uncompressed.slice(1)).slice(-20)))
}

// ---- keys ----

export function pubkeyOf(privateKey: Hex | string): Hex {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKey), true))
}

/** The 32-byte x-only form of a compressed public key (no 0x): the relay address messages are filed under. */
export function xonlyOf(pubkey: Hex | string): string {
  return nobleBytesToHex(hexToBytes(pubkey).slice(1))
}

export function validPubkey(pubkey: unknown): pubkey is Hex {
  if (typeof pubkey !== 'string' || !/^0x0[23][0-9a-fA-F]{64}$/.test(pubkey)) return false
  try {
    secp256k1.ProjectivePoint.fromHex(pubkey.slice(2)).assertValidity()
    return true
  } catch {
    return false
  }
}

// ---- EIP-191 personal signatures ----

export function eip191Hash(message: string): Uint8Array {
  const body = te.encode(message)
  const prefix = te.encode(`\x19Ethereum Signed Message:\n${body.length}`)
  const all = new Uint8Array(prefix.length + body.length)
  all.set(prefix, 0)
  all.set(body, prefix.length)
  return keccak_256(all)
}

/** personal_sign with a raw private key. Returns 0x r|s|v with v = 27 or 28 (identical to viem and ethers). */
export function signEip191(privateKey: Hex | string, message: string): Hex {
  const sig = secp256k1.sign(eip191Hash(message), hexToBytes(privateKey))
  const out = new Uint8Array(65)
  out.set(sig.toCompactRawBytes(), 0)
  out[64] = 27 + sig.recovery
  return bytesToHex(out)
}

/** Compressed public key that produced a 65-byte EIP-191 signature over `message`. Throws on malformed input. */
export function recoverEip191Pubkey(message: string, signature: string): Hex {
  const sig = hexToBytes(signature)
  if (sig.length !== 65) throw new Error('Bad signature length.')
  const v = sig[64] >= 27 ? sig[64] - 27 : sig[64]
  if (v !== 0 && v !== 1) throw new Error('Bad signature recovery id.')
  const pub = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(eip191Hash(message))
  return bytesToHex(pub.toRawBytes(true))
}

export function recoverEip191(message: string, signature: string): Address {
  return addressOfPubkey(recoverEip191Pubkey(message, signature))
}

/** Anything that can produce an EIP-191 signature for the wallet address. */
export interface Signer {
  address: Address
  signMessage(message: string): Promise<string>
}

/** A signer backed by an in-memory wallet private key. */
export function signerFromKey(privateKey: Hex | string): Signer {
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  return {
    address: addressOfPubkey(pubkeyOf(key)),
    signMessage: async (m) => signEip191(key, m),
  }
}

// ---- sealed box ----

function deriveKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(66)
  salt.set(ephPub, 0)
  salt.set(recipientPub, 33)
  return hkdf(sha256, shared, salt, INFO, 32)
}

/** Output layout: 33 ephemeral public key | 24 nonce | ciphertext with 16-byte tag. */
export function sealBox(plaintext: Uint8Array, recipientPub: Hex): Uint8Array {
  const recipient = hexToBytes(recipientPub)
  const eph = secp256k1.utils.randomPrivateKey()
  const ephPub = secp256k1.getPublicKey(eph, true)
  const shared = secp256k1.getSharedSecret(eph, recipient, true).slice(1)
  const nonce = randomBytes(24)
  const ct = xchacha20poly1305(deriveKey(shared, ephPub, recipient), nonce).encrypt(plaintext)
  const out = new Uint8Array(33 + 24 + ct.length)
  out.set(ephPub, 0)
  out.set(nonce, 33)
  out.set(ct, 57)
  return out
}

export function openBox(box: Uint8Array, privateKey: Hex | string): Uint8Array {
  if (box.length < 57 + 16) throw new Error('Message is too short.')
  const ephPub = box.slice(0, 33)
  const nonce = box.slice(33, 57)
  const ct = box.slice(57)
  const priv = hexToBytes(privateKey)
  const myPub = secp256k1.getPublicKey(priv, true)
  const shared = secp256k1.getSharedSecret(priv, ephPub, true).slice(1)
  return xchacha20poly1305(deriveKey(shared, ephPub, myPub), nonce).decrypt(ct)
}

// ---- contact cards ----

export interface ContactCard {
  address: Address
  pubkey: Hex
  name: string
}

/** Strips control and direction-changing characters so text from a stranger cannot disguise itself. */
export function cleanText(input: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '').trim().slice(0, max)
}

export function encodeCard(card: ContactCard): string {
  const name = te.encode(card.name.slice(0, 24))
  const out = new Uint8Array(20 + 33 + 1 + name.length)
  out.set(hexToBytes(card.address), 0)
  out.set(hexToBytes(card.pubkey), 20)
  out[53] = name.length
  out.set(name, 54)
  return CARD_PREFIX + toB64Url(out)
}

export function isCard(text: string): boolean {
  return text.trim().startsWith(CARD_PREFIX)
}

export function decodeCard(text: string): ContactCard {
  const raw = text.trim()
  if (!raw.startsWith(CARD_PREFIX)) throw new Error('That is not a contact card.')
  let b: Uint8Array
  try {
    b = fromB64Url(raw.slice(CARD_PREFIX.length))
  } catch {
    throw new Error('The contact card is damaged.')
  }
  if (b.length < 54 || b.length !== 54 + b[53]) throw new Error('The contact card is damaged.')
  const pubkey = bytesToHex(b.slice(20, 53))
  const address = toChecksumAddress(nobleBytesToHex(b.slice(0, 20)))
  // The address must belong to the public key, otherwise messages could be redirected.
  let derived: Address
  try {
    derived = addressOfPubkey(b.slice(20, 53))
  } catch {
    throw new Error('The contact card is damaged.')
  }
  if (derived !== address) throw new Error('The contact card does not match its address.')
  return { address, pubkey, name: cleanText(td.decode(b.slice(54, 54 + b[53])), 24) }
}

// ---- message envelope ----

export type MessageKind = 'text' | 'payment' | 'request'

export interface Inner {
  v: 1
  /** message id, 24 hex */
  i: string
  /** creation time, seconds */
  t: number
  /** sender address */
  f: Address
  /** recipient address, covered by the signature so a message cannot be re-targeted */
  o: Address
  k: MessageKind
  x?: string
  a?: string
  r?: Hex
  /** payment code (mp2:...) for kind 'payment' */
  c?: string
  /** EIP-191 signature by the sender's wallet key */
  s: Hex
}

export type Content = Pick<Inner, 'k' | 'x' | 'a' | 'r' | 'c'>

export function signedText(m: Omit<Inner, 's'>): string {
  const body = JSON.stringify([m.k, m.x ?? '', m.a ?? '', m.r ?? '', m.c ?? ''])
  const digest = nobleBytesToHex(sha256(te.encode(body)))
  return `meshpay-msg-v1\n${m.o.toLowerCase()}\n${m.i}\n${m.t}\n${digest}`
}

export async function buildInner(signer: Signer, to: Address, content: Content, nowMs = Date.now()): Promise<Inner> {
  const base: Omit<Inner, 's'> = {
    v: 1,
    i: nobleBytesToHex(randomBytes(12)),
    t: Math.floor(nowMs / 1000),
    f: signer.address,
    o: to,
    k: content.k,
    ...(content.x !== undefined ? { x: content.x } : {}),
    ...(content.a !== undefined ? { a: content.a } : {}),
    ...(content.r !== undefined ? { r: content.r } : {}),
    ...(content.c !== undefined ? { c: content.c } : {}),
  }
  return { ...base, s: (await signer.signMessage(signedText(base))) as Hex }
}

/** Throws unless the message is addressed to `me` and signed by the claimed sender. Returns the sender's public key. */
export async function verifyInner(inner: Inner, me: Address): Promise<Hex> {
  if (inner.v !== 1 || !inner.i || !inner.s) throw new Error('Unsupported message.')
  if (inner.o.toLowerCase() !== me.toLowerCase()) throw new Error('This message was not addressed to you.')
  const { s, ...base } = inner
  const text = signedText(base)
  const pub = recoverEip191Pubkey(text, s)
  if (addressOfPubkey(pub).toLowerCase() !== inner.f.toLowerCase()) throw new Error('The sender signature is invalid.')
  return pub
}

export function packInner(inner: Inner): Uint8Array {
  return te.encode(JSON.stringify(inner))
}

const HEX_ID = /^[0-9a-f]{24}$/
const HEX_REF = /^0x[0-9a-fA-F]{64}$/
const SIG = /^0x[0-9a-fA-F]{130}$/
const AMOUNT = /^\d{1,12}(\.\d{1,6})?$/

/** Everything a stranger controls is checked here, once, so nothing downstream can be crashed by it. */
export function validateInner(value: unknown, nowSec = Math.floor(Date.now() / 1000)): Inner {
  if (!value || typeof value !== 'object') throw new Error('bad message')
  const m = value as Record<string, unknown>
  const bad = (why: string) => new Error(`bad message: ${why}`)
  if (m.v !== 1) throw bad('version')
  if (typeof m.i !== 'string' || !HEX_ID.test(m.i)) throw bad('id')
  if (typeof m.t !== 'number' || !Number.isInteger(m.t) || m.t > nowSec + 86_400 || m.t < nowSec - 90 * 86_400) throw bad('time')
  if (typeof m.f !== 'string' || !isAddress(m.f) || typeof m.o !== 'string' || !isAddress(m.o)) throw bad('address')
  if (m.k !== 'text' && m.k !== 'payment' && m.k !== 'request') throw bad('kind')
  if (m.x !== undefined && (typeof m.x !== 'string' || m.x.length > 500)) throw bad('text')
  if (m.a !== undefined && (typeof m.a !== 'string' || !AMOUNT.test(m.a))) throw bad('amount')
  if (m.r !== undefined && (typeof m.r !== 'string' || !HEX_REF.test(m.r))) throw bad('ref')
  if (m.c !== undefined && (typeof m.c !== 'string' || m.c.length > 400 || !m.c.startsWith('mp2:'))) throw bad('code')
  if (typeof m.s !== 'string' || !SIG.test(m.s)) throw bad('signature')
  return {
    v: 1,
    i: m.i,
    t: m.t,
    f: m.f,
    o: m.o,
    k: m.k,
    ...(m.x !== undefined ? { x: m.x } : {}),
    ...(m.a !== undefined ? { a: m.a } : {}),
    ...(m.r !== undefined ? { r: m.r as Hex } : {}),
    ...(m.c !== undefined ? { c: m.c } : {}),
    s: m.s as Hex,
  }
}

export function unpackInner(bytes: Uint8Array, nowSec?: number): Inner {
  if (bytes.length > MAX_INNER_BYTES) throw new Error('bad message: too large')
  return validateInner(JSON.parse(td.decode(bytes)), nowSec)
}

/**
 * 24-hour retention policy (client side). A message is kept only while its creation time `t` is within the last
 * 24 hours; one claiming to be from more than a day in the future is refused.
 */
export function isWithinRetention(t: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return Number.isFinite(t) && t > nowSec - MESSAGE_TTL_SECONDS && t <= nowSec + MAX_FUTURE_SECONDS
}

// ---- offline message code ----

/** Offline handoff code: the recipient's relay address followed by the sealed box. */
export function encodeMessageCode(recipientPub: Hex, box: Uint8Array): string {
  const x = hexToBytes(xonlyOf(recipientPub))
  const out = new Uint8Array(32 + box.length)
  out.set(x, 0)
  out.set(box, 32)
  return MESSAGE_PREFIX + toB64Url(out)
}

export function isMessageCode(text: string): boolean {
  return text.trim().startsWith(MESSAGE_PREFIX)
}

export function decodeMessageCode(text: string): { recipientX: string; box: Uint8Array } {
  const raw = text.trim()
  if (!raw.startsWith(MESSAGE_PREFIX)) throw new Error('That is not a message code.')
  const b = fromB64Url(raw.slice(MESSAGE_PREFIX.length))
  if (b.length < 32 + 57 + 16) throw new Error('The message code is damaged.')
  return { recipientX: nobleBytesToHex(b.slice(0, 32)), box: b.slice(32) }
}

/** Sixty digits both people can compare out loud to confirm nobody is in the middle. */
export function safetyNumber(a: Hex, b: Hex): string {
  const [first, second] = [a, b].sort()
  const hash = sha256(hexToBytes(`${first}${second.slice(2)}`))
  const groups: string[] = []
  for (let i = 0; i < 12; i++) {
    const n = ((hash[i * 2] << 8) | hash[i * 2 + 1]) % 100000
    groups.push(String(n).padStart(5, '0'))
  }
  return groups.join(' ')
}

// ---- Nostr relay event wrapping a sealed box ----

export interface RelayEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/** `expiresAt` (unix seconds) becomes a NIP-40 expiration tag. It is a hint to relays; receivers enforce the 24h rule themselves. */
export function buildRelayEvent(recipientX: string, box: Uint8Array, expiresAt?: number): RelayEvent {
  const sk = schnorr.utils.randomPrivateKey()
  const pubkey = nobleBytesToHex(schnorr.getPublicKey(sk))
  const created_at = Math.floor(Date.now() / 1000)
  const tags = [['p', recipientX]]
  if (expiresAt) tags.push(['expiration', String(Math.floor(expiresAt))])
  const content = toB64Url(box)
  const id = nobleBytesToHex(sha256(te.encode(JSON.stringify([0, pubkey, created_at, RELAY_KIND, tags, content]))))
  const sig = nobleBytesToHex(schnorr.sign(nobleHexToBytes(id), sk))
  return { id, pubkey, created_at, kind: RELAY_KIND, tags, content, sig }
}

export function relayEventValid(e: RelayEvent, nowSec = Math.floor(Date.now() / 1000)): boolean {
  try {
    if (typeof e.content !== 'string' || e.content.length > MAX_RELAY_CONTENT) return false
    if (typeof e.created_at !== 'number' || Math.abs(e.created_at - nowSec) > MAX_RELAY_SKEW_SECONDS) return false
    const id = nobleBytesToHex(sha256(te.encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))))
    return id === e.id && schnorr.verify(nobleHexToBytes(e.sig), nobleHexToBytes(e.id), nobleHexToBytes(e.pubkey))
  } catch {
    return false
  }
}
