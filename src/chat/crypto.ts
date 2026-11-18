/**
 * Wayamesh chat protocol (pure, no platform imports). Identical copies live in
 *   - src/chat/crypto.ts            (phone)
 *   - web/src/lib/chat/crypto.ts    (web wallet)
 * A test (web/tests/chat.test.ts) fails if the two copies drift apart.
 *
 * Design (ported from the Arc Studio export, with two deliberate changes):
 *  1. Encryption uses a SEPARATE chat key derived from the wallet key with
 *     HKDF-SHA256 (info 'wayamesh-chat-v1'). The wallet signing key is never used for ECDH.
 *  2. Messages are signed by the chat key, not the wallet key, so sending a message never needs a
 *     biometric prompt. The wallet key signs only the contact card (EIP-191), binding chat key <-> address.
 *
 * Sealing: ephemeral ECDH on secp256k1 -> HKDF-SHA256 -> XChaCha20-Poly1305. Relays only ever see
 * ciphertext published under a throwaway Nostr key.
 */
import { schnorr, secp256k1 } from '@noble/curves/secp256k1'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils'

const te = new TextEncoder()
const td = new TextDecoder()

export const CARD_PREFIX = 'mpc1:'
export const MESSAGE_PREFIX = 'mpm1:'
export const RELAY_KIND = 1059
/** Chat messages self-delete: valid for 24 hours from creation. */
export const MESSAGE_TTL_SECONDS = 86400
/** Text only, hard cap per message. */
export const MAX_TEXT_CHARS = 1000
const CLOCK_SKEW_SECONDS = 600
const BOX_INFO = te.encode('wayamesh-chat-box-v1')
const KEY_INFO = 'wayamesh-chat-v1'

/** Lowercase hex without 0x. Public keys are 33-byte compressed (66 hex). Addresses are '0x' + 40 lowercase hex. */
export type Hex = string
export type Address = string

// ---- base64url (self contained so this file has no sibling imports) ----

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toB64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]
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

// ---- keys ----

/** Derives the chat private key (hex, no 0x) from the 32-byte wallet private key. One-way, domain separated. */
export function deriveChatKey(walletPrivateKey: string): Hex {
  const raw = walletPrivateKey.startsWith('0x') ? walletPrivateKey.slice(2) : walletPrivateKey
  const ikm = hexToBytes(raw)
  for (let n = 0; n < 8; n++) {
    const info = te.encode(n === 0 ? KEY_INFO : `${KEY_INFO}#${n}`)
    const k = hkdf(sha256, ikm, undefined, info, 32)
    if (secp256k1.utils.isValidPrivateKey(k)) return bytesToHex(k)
  }
  throw new Error('Could not derive a chat key.')
}

export function chatPubkeyOf(chatPrivateKey: Hex): Hex {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(chatPrivateKey), true))
}

/** 32-byte x-only form of a compressed public key: the relay "address" messages are filed under. */
export function xonlyOf(pubkey: Hex): string {
  return pubkey.slice(2)
}

export function addressOfPubkey(pubkey: Hex): Address {
  const uncompressed = secp256k1.ProjectivePoint.fromHex(pubkey).toRawBytes(false)
  return '0x' + bytesToHex(keccak_256(uncompressed.slice(1)).slice(-20))
}

// ---- sealed box ----

function boxKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(66)
  salt.set(ephPub, 0)
  salt.set(recipientPub, 33)
  return hkdf(sha256, shared, salt, BOX_INFO, 32)
}

/** Layout: 33 ephemeral public key | 24 nonce | ciphertext with 16 byte tag. */
export function sealBox(plaintext: Uint8Array, recipientPub: Hex): Uint8Array {
  const recipient = hexToBytes(recipientPub)
  const eph = secp256k1.utils.randomPrivateKey()
  const ephPub = secp256k1.getPublicKey(eph, true)
  const shared = secp256k1.getSharedSecret(eph, recipient, true).slice(1)
  const nonce = randomBytes(24)
  const ct = xchacha20poly1305(boxKey(shared, ephPub, recipient), nonce).encrypt(plaintext)
  const out = new Uint8Array(33 + 24 + ct.length)
  out.set(ephPub, 0)
  out.set(nonce, 33)
  out.set(ct, 57)
  return out
}

export function openBox(box: Uint8Array, chatPrivateKey: Hex): Uint8Array {
  if (box.length < 57 + 16) throw new Error('Message is too short.')
  const ephPub = box.slice(0, 33)
  const nonce = box.slice(33, 57)
  const ct = box.slice(57)
  const priv = hexToBytes(chatPrivateKey)
  const myPub = secp256k1.getPublicKey(priv, true)
  const shared = secp256k1.getSharedSecret(priv, ephPub, true).slice(1)
  return xchacha20poly1305(boxKey(shared, ephPub, myPub), nonce).decrypt(ct)
}

// ---- EIP-191 helpers (no viem/ethers needed) ----

export function eip191Hash(message: string): Uint8Array {
  const body = te.encode(message)
  return keccak_256(new Uint8Array([...te.encode(`\x19Ethereum Signed Message:\n${body.length}`), ...body]))
}

/** Address that produced a 65-byte (r|s|v) EIP-191 signature over `message`. Throws on malformed input. */
export function recoverEip191(message: string, signature: string): Address {
  const sig = hexToBytes(signature.startsWith('0x') ? signature.slice(2) : signature)
  if (sig.length !== 65) throw new Error('Bad signature length.')
  const v = sig[64] >= 27 ? sig[64] - 27 : sig[64]
  if (v !== 0 && v !== 1) throw new Error('Bad signature recovery id.')
  const pub = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(eip191Hash(message))
  return addressOfPubkey(pub.toHex(true))
}

/** Anything that can produce an EIP-191 personal_sign signature (viem account, ethers Wallet adapter...). */
export interface WalletSigner {
  address: string
  signMessage(message: string): Promise<string>
}

// ---- contact cards ----

export interface ContactCard {
  address: Address
  pubkey: Hex
  name: string
}

export function cardStatement(address: Address, pubkey: Hex): string {
  return `Wayamesh chat key\naddress: ${address.toLowerCase()}\nchat key: ${pubkey.toLowerCase()}`
}

/** Card = address(20) | chat pubkey(33) | nameLen(1) | name | wallet signature(65). */
export async function buildCard(signer: WalletSigner, chatPubkey: Hex, name: string): Promise<string> {
  const address = signer.address.toLowerCase()
  const sigHex = await signer.signMessage(cardStatement(address, chatPubkey))
  const sig = hexToBytes(sigHex.startsWith('0x') ? sigHex.slice(2) : sigHex)
  if (sig.length !== 65) throw new Error('Unexpected signature length.')
  const nm = te.encode(name.slice(0, 24))
  const out = new Uint8Array(20 + 33 + 1 + nm.length + 65)
  out.set(hexToBytes(address.slice(2)), 0)
  out.set(hexToBytes(chatPubkey), 20)
  out[53] = nm.length
  out.set(nm, 54)
  out.set(sig, 54 + nm.length)
  return CARD_PREFIX + toB64Url(out)
}

/** Changes the display name on a card. The name is not covered by the wallet signature (the address/key binding is). */
export function renameCard(card: string, name: string): string {
  const c = decodeCard(card)
  const b = fromB64Url(card.trim().slice(CARD_PREFIX.length))
  const sig = b.slice(54 + b[53])
  const nm = te.encode(name.slice(0, 24))
  const out = new Uint8Array(20 + 33 + 1 + nm.length + 65)
  out.set(hexToBytes(c.address.slice(2)), 0)
  out.set(hexToBytes(c.pubkey), 20)
  out[53] = nm.length
  out.set(nm, 54)
  out.set(sig, 54 + nm.length)
  return CARD_PREFIX + toB64Url(out)
}

export function isCard(text: string): boolean {
  return text.trim().startsWith(CARD_PREFIX)
}

/** Parses AND verifies a card: the wallet address must have signed this exact chat key. Throws otherwise. */
export function decodeCard(text: string): ContactCard {
  const raw = text.trim()
  if (!raw.startsWith(CARD_PREFIX)) throw new Error('That is not a contact card.')
  let b: Uint8Array
  try {
    b = fromB64Url(raw.slice(CARD_PREFIX.length))
  } catch {
    throw new Error('The contact card is damaged.')
  }
  if (b.length < 54 + 65 || b.length !== 54 + b[53] + 65) throw new Error('The contact card is damaged.')
  const address = '0x' + bytesToHex(b.slice(0, 20))
  const pubkey = bytesToHex(b.slice(20, 53))
  const nameEnd = 54 + b[53]
  const sig = '0x' + bytesToHex(b.slice(nameEnd, nameEnd + 65))
  let signer: Address
  try {
    secp256k1.ProjectivePoint.fromHex(pubkey).assertValidity()
    signer = recoverEip191(cardStatement(address, pubkey), sig)
  } catch {
    throw new Error('The contact card signature is invalid.')
  }
  if (signer !== address) throw new Error('The contact card was not signed by its wallet address.')
  return { address, pubkey, name: td.decode(b.slice(54, nameEnd)) }
}

// ---- message envelope (the plaintext inside the sealed box) ----

export type MessageKind = 'text' | 'payment' | 'ack'

export interface Inner {
  v: 1
  /** message id (24 hex) */
  i: string
  /** unix seconds */
  t: number
  /** expiry, unix seconds (t + 24h). Signed with the message; the receiver drops it after this time. */
  e: number
  /** sender wallet address */
  f: Address
  /** recipient wallet address, covered by the signature so a message cannot be re-targeted */
  o: Address
  /** sender chat public key */
  p: Hex
  k: MessageKind
  /** text, or for kind 'ack' the id of the message being acknowledged */
  x?: string
  /** payment amount (display string, informational; the payment code itself is authoritative) */
  a?: string
  /** payment code (mp2:... voucher or WMTX envelope) for kind 'payment' */
  c?: string
  /** sender's signed contact card, so a stranger can verify who this is */
  d?: string
  /** chat-key signature (64-byte compact ECDSA, hex) */
  s: Hex
}

export type Content = Pick<Inner, 'k' | 'x' | 'a' | 'c'>

function signedDigest(m: Omit<Inner, 's'>): Uint8Array {
  const body = JSON.stringify([m.k, m.x ?? '', m.a ?? '', m.c ?? '', m.d ?? ''])
  return sha256(te.encode(`wayamesh-msg-v1\n${m.f}\n${m.o}\n${m.p}\n${m.i}\n${m.t}\n${m.e}\n${bytesToHex(sha256(te.encode(body)))}`))
}

export function buildInner(chatPrivateKey: Hex, from: Address, to: Address, content: Content, card?: string, nowMs = Date.now()): Inner {
  if ((content.x ?? '').length > MAX_TEXT_CHARS && content.k !== 'ack') throw new Error(`Messages are limited to ${MAX_TEXT_CHARS} characters.`)
  const t = Math.floor(nowMs / 1000)
  const base: Omit<Inner, 's'> = {
    v: 1,
    i: bytesToHex(randomBytes(12)),
    t,
    e: t + MESSAGE_TTL_SECONDS,
    f: from.toLowerCase(),
    o: to.toLowerCase(),
    p: chatPubkeyOf(chatPrivateKey),
    ...content,
    ...(card ? { d: card } : {}),
  }
  const s = bytesToHex(secp256k1.sign(signedDigest(base), hexToBytes(chatPrivateKey)).toCompactRawBytes())
  return { ...base, s }
}

export interface Verified {
  inner: Inner
  /** The sender's verified contact card, if the message carried one. */
  card: ContactCard | null
}

/**
 * Checks the message is addressed to `me`, that the chat-key signature is valid, and that (when a card is attached)
 * the card is genuine and matches the sender. Throws on any failure. Does NOT decide trust: the caller compares
 * `inner.p` against a stored contact (or treats an unknown sender as a request).
 */
export function verifyInner(inner: Inner, me: Address, nowSec = Math.floor(Date.now() / 1000)): Verified {
  if (inner.v !== 1 || !inner.i || !inner.s || !inner.p || !Number.isFinite(inner.e)) throw new Error('Unsupported message.')
  if (inner.e <= nowSec) throw new Error('This message has expired.')
  if (inner.e > nowSec + MESSAGE_TTL_SECONDS + CLOCK_SKEW_SECONDS) throw new Error('Unsupported message expiry.')
  if (typeof inner.x === 'string' && inner.x.length > MAX_TEXT_CHARS && inner.k !== 'ack') throw new Error('Message too long.')
  if (inner.o.toLowerCase() !== me.toLowerCase()) throw new Error('This message was not addressed to you.')
  const { s, ...base } = inner
  if (!secp256k1.verify(hexToBytes(s), signedDigest(base), hexToBytes(inner.p))) throw new Error('The sender signature is invalid.')
  let card: ContactCard | null = null
  if (inner.d) {
    card = decodeCard(inner.d)
    if (card.address !== inner.f.toLowerCase() || card.pubkey !== inner.p) throw new Error('The attached card does not match the sender.')
  }
  return { inner, card }
}

export function packInner(inner: Inner): Uint8Array {
  return te.encode(JSON.stringify(inner))
}

export function unpackInner(bytes: Uint8Array): Inner {
  return JSON.parse(td.decode(bytes)) as Inner
}

/** Seal a message to a recipient chat key. Returns the opaque box. */
export function sealMessage(inner: Inner, recipientPub: Hex): Uint8Array {
  return sealBox(packInner(inner), recipientPub)
}

/** Open + verify. Throws on wrong key, tampering, wrong recipient or bad signature. */
export function openMessage(box: Uint8Array, chatPrivateKey: Hex, me: Address, nowSec?: number): Verified {
  return verifyInner(unpackInner(openBox(box, chatPrivateKey)), me, nowSec)
}

// ---- offline message code (carried over Bluetooth, QR, paste...) ----

/** Recipient relay address (32 bytes) followed by the sealed box. */
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
  return { recipientX: bytesToHex(b.slice(0, 32)), box: b.slice(32) }
}

/** Sixty digits both people can compare to confirm nobody is in the middle. */
export function safetyNumber(a: Hex, b: Hex): string {
  const [first, second] = [a, b].sort()
  const hash = sha256(hexToBytes(first + second))
  const groups: string[] = []
  for (let i = 0; i < 12; i++) groups.push(String(((hash[i * 2] << 8) | hash[i * 2 + 1]) % 100000).padStart(5, '0'))
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

/** `expiresAt` (unix seconds) becomes a NIP-40 expiration tag so well-behaved relays delete the event themselves. */
export function buildRelayEvent(recipientX: string, box: Uint8Array, expiresAt?: number): RelayEvent {
  const sk = schnorr.utils.randomPrivateKey()
  const pubkey = bytesToHex(schnorr.getPublicKey(sk))
  const created_at = Math.floor(Date.now() / 1000)
  const tags = [['p', recipientX]]
  if (expiresAt) tags.push(['expiration', String(Math.floor(expiresAt))])
  const content = toB64Url(box)
  const id = bytesToHex(sha256(te.encode(JSON.stringify([0, pubkey, created_at, RELAY_KIND, tags, content]))))
  const sig = bytesToHex(schnorr.sign(hexToBytes(id), sk))
  return { id, pubkey, created_at, kind: RELAY_KIND, tags, content, sig }
}

export function relayEventValid(e: RelayEvent): boolean {
  try {
    const id = bytesToHex(sha256(te.encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))))
    return id === e.id && schnorr.verify(hexToBytes(e.sig), hexToBytes(e.id), hexToBytes(e.pubkey))
  } catch {
    return false
  }
}
