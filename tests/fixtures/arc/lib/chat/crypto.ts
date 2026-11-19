import { schnorr, secp256k1 } from '@noble/curves/secp256k1'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, getAddress, hexToBytes, isAddress, recoverMessageAddress, recoverPublicKey, hashMessage, type Address, type Hex } from 'viem'
import { publicKeyToAddress } from 'viem/utils'
import type { privateKeyToAccount } from 'viem/accounts'
import { cleanText, fromB64Url, toB64Url } from '../mesh'

/**
 * End-to-end encryption for chat. The sender seals each message to the recipient's public key
 * (ephemeral ECDH on secp256k1, HKDF-SHA256, XChaCha20-Poly1305) and signs the plaintext with
 * their wallet key inside the box. Relays and couriers only ever see ciphertext.
 */

const INFO = new TextEncoder().encode('meshpay-chat-v1')
const te = new TextEncoder()
const td = new TextDecoder()

export const CARD_PREFIX = 'mpc1:'
export const MESSAGE_PREFIX = 'mpm1:'

type Account = Pick<ReturnType<typeof privateKeyToAccount>, 'address' | 'signMessage'>

export function pubkeyOf(privateKey: Hex): Hex {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKey), true))
}

/** The 32-byte x-only form of a compressed public key, used as the relay address. */
export function xonlyOf(pubkey: Hex): string {
  return bytesToHex(hexToBytes(pubkey).slice(1)).slice(2)
}

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
  const key = deriveKey(shared, ephPub, recipient)
  const nonce = crypto.getRandomValues(new Uint8Array(24))
  const ct = xchacha20poly1305(key, nonce).encrypt(plaintext)
  const out = new Uint8Array(33 + 24 + ct.length)
  out.set(ephPub, 0)
  out.set(nonce, 33)
  out.set(ct, 57)
  return out
}

export function openBox(box: Uint8Array, privateKey: Hex): Uint8Array {
  if (box.length < 57 + 16) throw new Error('Message is too short.')
  const ephPub = box.slice(0, 33)
  const nonce = box.slice(33, 57)
  const ct = box.slice(57)
  const priv = hexToBytes(privateKey)
  const myPub = secp256k1.getPublicKey(priv, true)
  const shared = secp256k1.getSharedSecret(priv, ephPub, true).slice(1)
  return xchacha20poly1305(deriveKey(shared, ephPub, myPub), nonce).decrypt(ct)
}

// ---- contact cards: how two people exchange an address and a public key ----

export interface ContactCard {
  address: Address
  pubkey: Hex
  name: string
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
  const b = fromB64Url(raw.slice(CARD_PREFIX.length))
  if (b.length < 54 || b.length !== 54 + b[53]) throw new Error('The contact card is damaged.')
  const pubkey = bytesToHex(b.slice(20, 53))
  const address = getAddress(bytesToHex(b.slice(0, 20)))
  // The address must belong to the public key, otherwise messages could be redirected.
  const derived = publicKeyToAddress(`0x${secp256k1.ProjectivePoint.fromHex(b.slice(20, 53)).toHex(false)}`)
  if (derived !== address) throw new Error('The contact card does not match its address.')
  return { address, pubkey, name: cleanText(td.decode(b.slice(54, 54 + b[53])), 24) }
}

// ---- message envelope ----

export type MessageKind = 'text' | 'payment' | 'request'

export interface Inner {
  v: 1
  /** message id */
  i: string
  /** timestamp, seconds */
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
  /** signature by the sender's wallet key */
  s: Hex
}

function signedText(m: Omit<Inner, 's'>): string {
  const body = JSON.stringify([m.k, m.x ?? '', m.a ?? '', m.r ?? '', m.c ?? ''])
  const digest = bytesToHex(sha256(te.encode(body))).slice(2)
  return `meshpay-msg-v1\n${m.o.toLowerCase()}\n${m.i}\n${m.t}\n${digest}`
}

export async function buildInner(account: Account, to: Address, content: Pick<Inner, 'k' | 'x' | 'a' | 'r' | 'c'>): Promise<Inner> {
  const base: Omit<Inner, 's'> = {
    v: 1,
    i: bytesToHex(crypto.getRandomValues(new Uint8Array(12))).slice(2),
    t: Math.floor(Date.now() / 1000),
    f: account.address,
    o: to,
    ...content,
  }
  return { ...base, s: await account.signMessage({ message: signedText(base) }) }
}

/** Throws unless the message is addressed to `me` and signed by the claimed sender. Returns the sender's public key. */
export async function verifyInner(inner: Inner, me: Address): Promise<Hex> {
  if (inner.v !== 1 || !inner.i || !inner.s) throw new Error('Unsupported message.')
  if (inner.o.toLowerCase() !== me.toLowerCase()) throw new Error('This message was not addressed to you.')
  const { s, ...base } = inner
  const text = signedText(base)
  const signer = await recoverMessageAddress({ message: text, signature: s })
  if (signer.toLowerCase() !== inner.f.toLowerCase()) throw new Error('The sender signature is invalid.')
  return recoverPublicKey({ hash: hashMessage(text), signature: s })
    .then((pk) => bytesToHex(secp256k1.ProjectivePoint.fromHex(pk.slice(2)).toRawBytes(true)))
}

export function packInner(inner: Inner): Uint8Array {
  return te.encode(JSON.stringify(inner))
}

const HEX_ID = /^[0-9a-f]{24}$/
const HEX_REF = /^0x[0-9a-fA-F]{64}$/
const SIG = /^0x[0-9a-fA-F]{130}$/
const AMOUNT = /^\d{1,12}(\.\d{1,6})?$/

/** Everything a stranger controls is checked here, once, so nothing downstream can be crashed by it. */
function validateInner(value: unknown): Inner {
  if (!value || typeof value !== 'object') throw new Error('bad message')
  const m = value as Record<string, unknown>
  const now = Math.floor(Date.now() / 1000)
  const bad = (why: string) => new Error(`bad message: ${why}`)
  if (m.v !== 1) throw bad('version')
  if (typeof m.i !== 'string' || !HEX_ID.test(m.i)) throw bad('id')
  if (typeof m.t !== 'number' || !Number.isInteger(m.t) || m.t > now + 86_400 || m.t < now - 90 * 86_400) throw bad('time')
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

export function unpackInner(bytes: Uint8Array): Inner {
  if (bytes.length > 4096) throw new Error('bad message: too large')
  return validateInner(JSON.parse(td.decode(bytes)))
}

/** Offline handoff code: the recipient's relay address followed by the sealed box. */
export function encodeMessageCode(recipientPub: Hex, box: Uint8Array): string {
  const x = hexToBytes(`0x${xonlyOf(recipientPub)}`)
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
  return { recipientX: bytesToHex(b.slice(0, 32)).slice(2), box: b.slice(32) }
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

export const RELAY_KIND = 1059

export interface RelayEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export function buildRelayEvent(recipientX: string, box: Uint8Array): RelayEvent {
  const sk = schnorr.utils.randomPrivateKey()
  const pubkey = bytesToHex(schnorr.getPublicKey(sk)).slice(2)
  const created_at = Math.floor(Date.now() / 1000)
  const tags = [['p', recipientX]]
  const content = toB64Url(box)
  const id = bytesToHex(sha256(te.encode(JSON.stringify([0, pubkey, created_at, RELAY_KIND, tags, content])))).slice(2)
  const sig = bytesToHex(schnorr.sign(hexToBytes(`0x${id}`), sk)).slice(2)
  return { id, pubkey, created_at, kind: RELAY_KIND, tags, content, sig }
}

export function relayEventValid(e: RelayEvent): boolean {
  try {
    const now = Math.floor(Date.now() / 1000)
    if (typeof e.content !== 'string' || e.content.length > 12_000) return false
    if (typeof e.created_at !== 'number' || Math.abs(e.created_at - now) > 2 * 86_400) return false
    const id = bytesToHex(sha256(te.encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])))).slice(2)
    return id === e.id && schnorr.verify(hexToBytes(`0x${e.sig}`), hexToBytes(`0x${e.id}`), hexToBytes(`0x${e.pubkey}`))
  } catch {
    return false
  }
}
