/**
 * Hostile-input checks, ported from the Arc Studio web wallet's scripts/security-tests.ts (33 checks), plus phone-specific ones
 * (24h retention window, caps, sender-claimed amounts). Each feeds the app something an attacker could send over a relay, by
 * QR or by paste and confirms it is refused instead of crashing the wallet or fooling the user.
 * Run: npm run test:security
 */
import { describe, expect, it } from 'vitest'
import { ethers } from 'ethers'
import * as chat from '../src/chat/crypto'
import * as voucher from '../src/mesh/voucher'
import { fmtDecimal, unsafeRecipient, lookalike, CAPS } from '../src/utils/safety'
import { parseRequest } from '../src/mesh/request'
import { recoverFromPayloads } from '../src/wallet/shards'

const throws = (f: () => unknown) => {
  try {
    f()
    return false
  } catch {
    return true
  }
}

const aliceW = ethers.Wallet.createRandom()
const bobW = ethers.Wallet.createRandom()
const alice = chat.signerFromKey(aliceW.privateKey)
const bob = chat.signerFromKey(bobW.privateKey)
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o))

describe('33 hostile-input checks (ported)', async () => {
  const good = await chat.buildInner(alice, bob.address, { k: 'payment', a: '2.5', x: 'hi' })
  const evil = (patch: Record<string, unknown>) => enc({ ...good, ...patch })

  it('1 valid message passes validation', () => expect(throws(() => chat.unpackInner(chat.packInner(good)))).toBe(false))
  it('2 valid message signature verifies', async () =>
    expect(await chat.verifyInner(chat.unpackInner(chat.packInner(good)), bob.address)).toBe(chat.pubkeyOf(aliceW.privateKey)))
  it('3 message re-targeted to someone else is rejected', async () => {
    await expect(chat.verifyInner(chat.unpackInner(chat.packInner(good)), alice.address)).rejects.toThrow()
  })
  it('4 amount "abc" rejected', () => expect(throws(() => chat.unpackInner(evil({ a: 'abc' })))).toBe(true))
  it('5 amount "1e5" rejected', () => expect(throws(() => chat.unpackInner(evil({ a: '1e5' })))).toBe(true))
  it('6 amount "-1" rejected', () => expect(throws(() => chat.unpackInner(evil({ a: '-1' })))).toBe(true))
  it('7 amount of 100k digits rejected', () => expect(throws(() => chat.unpackInner(evil({ a: '9'.repeat(100000) })))).toBe(true))
  it('8 amount as an object rejected', () => expect(throws(() => chat.unpackInner(evil({ a: { x: 1 } })))).toBe(true))
  it('9 text as an object rejected', () => expect(throws(() => chat.unpackInner(evil({ x: { evil: true } })))).toBe(true))
  it('10 text over 500 chars rejected', () => expect(throws(() => chat.unpackInner(evil({ x: 'a'.repeat(501) })))).toBe(true))
  it('11 unknown kind rejected', () => expect(throws(() => chat.unpackInner(evil({ k: 'admin' })))).toBe(true))
  it('12 far-future timestamp rejected', () => expect(throws(() => chat.unpackInner(evil({ t: 4_000_000_000 })))).toBe(true))
  it('13 bad id rejected', () => expect(throws(() => chat.unpackInner(evil({ i: '../../x' })))).toBe(true))
  it('14 ref that is not 32 bytes rejected', () => expect(throws(() => chat.unpackInner(evil({ r: '0x12' })))).toBe(true))
  it('15 payment code that is not mp2 rejected', () => expect(throws(() => chat.unpackInner(evil({ c: 'javascript:alert(1)' })))).toBe(true))
  it('16 payload over 4KB rejected', () => expect(throws(() => chat.unpackInner(new Uint8Array(5000).fill(32)))).toBe(true))

  const ev = chat.buildRelayEvent('a'.repeat(64), new Uint8Array(100))
  it('17 fresh relay event accepted', () => expect(chat.relayEventValid(ev)).toBe(true))
  it('18 relay event dated years ahead rejected', () => expect(chat.relayEventValid({ ...ev, created_at: ev.created_at + 10 * 365 * 86400 })).toBe(false))
  it('19 relay event with giant content rejected', () => expect(chat.relayEventValid({ ...ev, content: 'a'.repeat(20000) })).toBe(false))
  it('20 relay event with tampered content rejected', () => expect(chat.relayEventValid({ ...ev, content: ev.content + 'x' })).toBe(false))

  const payment = {
    from: alice.address, to: bob.address, amount: 1_000_000n, fee: 0n, nonce: 5n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), ref: voucher.ZERO_REF,
  }
  it('21 canonical signature accepted', async () => {
    const sig = await voucher.signPayment(aliceW as unknown as ethers.Wallet, payment)
    expect(voucher.isCanonicalSignature(sig)).toBe(true)
    expect(throws(() => voucher.decodeVoucher(voucher.encodeVoucher({ payment, signature: sig })))).toBe(false)
  })
  it('22 malleated (high-s) signature rejected', async () => {
    const sig = await voucher.signPayment(aliceW as unknown as ethers.Wallet, payment)
    const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
    const s = BigInt(`0x${sig.slice(66, 130)}`)
    const v = parseInt(sig.slice(130), 16) === 27 ? 28 : 27
    const flipped = `0x${sig.slice(2, 66)}${(N - s).toString(16).padStart(64, '0')}${v.toString(16)}`
    expect(voucher.isCanonicalSignature(flipped)).toBe(false)
    expect(throws(() => voucher.decodeVoucher(voucher.encodeVoucher({ payment, signature: flipped })))).toBe(true)
  })

  it('23 request with absurd amount drops the amount', () => expect(parseRequest(`meshpay:${bob.address}?amount=${'9'.repeat(200)}`)?.amount).toBeUndefined())
  it('24 request note is cleaned of direction tricks', () =>
    expect(parseRequest(`meshpay:${bob.address}?note=${encodeURIComponent('pay‮evil​')}`)?.note ?? '').not.toMatch(/[‮​]/))
  it('25 cleanText strips control characters', () => expect(chat.cleanText('a\u0000b‮c', 10)).toBe('abc'))
  it('26 contact card name is cleaned', () =>
    expect(chat.decodeCard(chat.encodeCard({ address: alice.address, pubkey: chat.pubkeyOf(aliceW.privateKey), name: 'Mom‮' })).name).not.toContain('‮'))
  it('27 contact card whose address does not match its key is rejected', () =>
    expect(throws(() => chat.decodeCard(chat.encodeCard({ address: bob.address, pubkey: chat.pubkeyOf(aliceW.privateKey), name: 'x' })))).toBe(true))
  it('28 fmtDecimal never throws on garbage', () => {
    expect(fmtDecimal('abc')).toBe('')
    expect(fmtDecimal({})).toBe('')
    expect(fmtDecimal('1e5')).toBe('')
    expect(fmtDecimal('2.5')).toBe('2.50')
  })
  it('29 zero address blocked as a recipient', () => expect(unsafeRecipient('0x0000000000000000000000000000000000000000')).not.toBeNull())
  it('30 USDC contract blocked as a recipient', () => expect(unsafeRecipient('0x3600000000000000000000000000000000000000')).not.toBeNull())
  it('31 settlement contract blocked as a recipient', () => expect(unsafeRecipient(voucher.MESHPAY_ADDRESS)).not.toBeNull())
  it('32 ordinary address allowed', () => expect(unsafeRecipient(bob.address)).toBeNull())
  it('33 shard with impossible numbers rejected', () =>
    expect(throws(() => recoverFromPayloads([
      JSON.stringify({ v: 1, i: 99, t: 2, n: 3, a: '12345678', s: 'AAAA' }),
      JSON.stringify({ v: 1, i: 1, t: 2, n: 3, a: '12345678', s: 'AAAA' }),
    ]))).toBe(true))
})

describe('phone-specific hardening', () => {
  it('messages older than 24h, or more than a day in the future, are outside the retention window', () => {
    const now = 1_800_000_000
    expect(chat.isWithinRetention(now - 3600, now)).toBe(true)
    expect(chat.isWithinRetention(now - 86_400, now)).toBe(false)
    expect(chat.isWithinRetention(now - 30 * 86_400, now)).toBe(false)
    expect(chat.isWithinRetention(now + 3600, now)).toBe(true)
    expect(chat.isWithinRetention(now + 86_400 + 1, now)).toBe(false)
    expect(chat.isWithinRetention(Number.NaN, now)).toBe(false)
  })
  it('relay events carry a NIP-40 expiration tag when asked, and are still valid', () => {
    const exp = Math.floor(Date.now() / 1000) + 86_400
    const e = chat.buildRelayEvent('b'.repeat(64), new Uint8Array(100), exp)
    expect(e.tags).toContainEqual(['expiration', String(exp)])
    expect(chat.relayEventValid(e)).toBe(true)
  })
  it('a tampered sealed box, a wrong key and a truncated box never decrypt', () => {
    const box = chat.sealBox(new TextEncoder().encode('secret'), chat.pubkeyOf(bobW.privateKey))
    expect(new TextDecoder().decode(chat.openBox(box, bobW.privateKey))).toBe('secret')
    const bad = box.slice(); bad[bad.length - 1] ^= 1
    expect(throws(() => chat.openBox(bad, bobW.privateKey))).toBe(true)
    expect(throws(() => chat.openBox(box, aliceW.privateKey))).toBe(true)
    expect(throws(() => chat.openBox(box.slice(0, 40), bobW.privateKey))).toBe(true)
  })
  it('a message signed by one key but claiming another sender is rejected', async () => {
    const forged = await chat.buildInner({ address: bob.address, signMessage: alice.signMessage }, alice.address, { k: 'text', x: 'pay me' })
    await expect(chat.verifyInner(chat.unpackInner(chat.packInner(forged)), alice.address)).rejects.toThrow()
  })
  it('garbage never throws out of the parsers the receive path uses', () => {
    for (const junk of ['', 'mpc1:', 'mpc1:AAAA', 'mpm1:AAAA', '{', 'null', '[]', '\u0000'.repeat(50)]) {
      expect(throws(() => chat.decodeCard(junk))).toBe(true)
      expect(throws(() => chat.decodeMessageCode(junk))).toBe(true)
      expect(throws(() => chat.unpackInner(new TextEncoder().encode(junk)))).toBe(true)
    }
  })
  it('look-alike addresses are flagged, the real contact is not', () => {
    const real = '0x1234567890abcdef1234567890abcdef12345678'
    const fake = '0x123456ffffffffffffffffffffffffffff5678'.padEnd(42, '0').slice(0, 38) + '5678'
    expect(lookalike(fake, [real])).toBe(real)
    expect(lookalike(real, [real])).toBeNull()
  })
  it('caps match the review (150 unsettled, 400 stored, 2500 messages, 300 contacts, 40 requests)', () => {
    expect(CAPS).toMatchObject({ unsettledPayments: 150, storedPayments: 400, messages: 2500, contacts: 300, messageRequests: 40 })
  })
})
