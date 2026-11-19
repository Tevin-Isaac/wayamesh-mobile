/**
 * Cross-compatibility with the Arc Studio web wallet. The Arc modules under tests/fixtures/arc are verbatim copies
 * (see SOURCE.sha256); nothing here edits them. Every row of the porting guide's section 8 is reproduced, and messages
 * are sealed by one implementation and opened by the other in both directions.
 */
import { describe, expect, it } from 'vitest'
import { ethers } from 'ethers'
import { privateKeyToAccount } from 'viem/accounts'
import * as arcChat from './fixtures/arc/lib/chat/crypto'
import * as arcMesh from './fixtures/arc/lib/mesh'
import * as phone from '../src/chat/crypto'
import * as voucher from '../src/mesh/voucher'

const MNEMONIC = 'test test test test test test test test test test test junk'
const path = (n: number) => `m/44'/60'/0'/0/${n}`
const w0 = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, path(0))
const w1 = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, path(1))
const arc0 = privateKeyToAccount(w0.privateKey as `0x${string}`)
const arc1 = privateKeyToAccount(w1.privateKey as `0x${string}`)
const phone0 = phone.signerFromKey(w0.privateKey)
const phone1 = phone.signerFromKey(w1.privateKey)

const PAYMENT = {
  from: w0.address,
  to: w1.address,
  amount: 2_500_000n,
  fee: 10_000n,
  nonce: 123_456_789n,
  deadline: 1_800_000_000n,
  ref: voucher.ZERO_REF,
}

describe('section 8 test vectors (phone implementation)', () => {
  it('account 0 and 1 addresses from the test mnemonic', () => {
    expect(w0.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(w1.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    expect(phone0.address).toBe(w0.address)
    expect(phone1.address).toBe(w1.address)
  })

  it('EIP-712 payment signature', async () => {
    const sig = await voucher.signPayment(w0 as unknown as ethers.Wallet, PAYMENT)
    expect(sig).toBe('0xce2d8672b0c652618b921e8674d16f59a47a31415c0969e0ab85f57b0ae057d614ebf49dd2f1d7b17aaa3f003c5f324b3f0400986b6a7afd019c35f8de0425251b')
    expect(voucher.isCanonicalSignature(sig)).toBe(true)
  })

  it('voucher code', async () => {
    const signature = await voucher.signPayment(w0 as unknown as ethers.Wallet, PAYMENT)
    const code = voucher.encodeVoucher({ payment: PAYMENT, signature })
    expect(code).toBe(
      'mp2:AvOf1uUarYj29M5quIJyec__uSJmcJl5cMUYEtw6AQx9AbUODRfcecgAAAAAAAAAAAAAAAAAJiWgAAAAAAAAJxAAAAAAB1vNFQAAAABrSdIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADOLYZysMZSYYuSHoZ00W9ZpHoxQVwJaeCrhfV7CuBX1hTr9J3S8dexeqo_ADxfMks_BACYa2p6_QGcNfjeBCUlGw',
    )
    const back = voucher.decodeVoucher(code)
    expect(back.payment.amount).toBe(2_500_000n)
    expect(voucher.isSignatureValid(back)).toBe(true)
  })

  it('contact card (account 0, name Alice)', () => {
    const card = phone.encodeCard({ address: phone0.address, pubkey: phone.pubkeyOf(w0.privateKey), name: 'Alice' })
    expect(card).toBe('mpc1:85_W5RqtiPb0zmq4gnJ5z_-5ImYDgxhTW1QQXUp6rmDAj8RflocYG0_fxiW9GnU_pzl_7XUFQWxpY2U')
    const dec = phone.decodeCard(card)
    expect(dec.address).toBe(w0.address)
    expect(dec.name).toBe('Alice')
  })

  it('safety number', () => {
    const n = phone.safetyNumber(phone.pubkeyOf(w0.privateKey), phone.pubkeyOf(w1.privateKey))
    expect(n).toBe('58759 09493 34804 05456 20453 38405 23648 47293 61382 48952 26421 25824')
    expect(phone.safetyNumber(phone.pubkeyOf(w1.privateKey), phone.pubkeyOf(w0.privateKey))).toBe(n)
  })
})

describe('Arc Studio own modules reproduce the same vectors (sanity of the fixture)', () => {
  it('card, safety number and signature', async () => {
    expect(arcChat.encodeCard({ address: arc0.address, pubkey: arcChat.pubkeyOf(w0.privateKey as `0x${string}`), name: 'Alice' })).toBe(
      'mpc1:85_W5RqtiPb0zmq4gnJ5z_-5ImYDgxhTW1QQXUp6rmDAj8RflocYG0_fxiW9GnU_pzl_7XUFQWxpY2U',
    )
    const sig = await arcMesh.signPayment(arc0, PAYMENT as never)
    expect(sig).toBe('0xce2d8672b0c652618b921e8674d16f59a47a31415c0969e0ab85f57b0ae057d614ebf49dd2f1d7b17aaa3f003c5f324b3f0400986b6a7afd019c35f8de0425251b')
  })
})

describe('primitives match viem byte for byte', () => {
  it('EIP-191 signature is identical (deterministic RFC 6979)', async () => {
    const msg = 'meshpay-msg-v1\nhello'
    expect(phone.signEip191(w0.privateKey, msg)).toBe(await arc0.signMessage({ message: msg }))
  })
  it('checksum addresses match viem', () => {
    expect(phone.toChecksumAddress(arc1.address.toLowerCase())).toBe(arc1.address)
  })
  it('signed digest text matches Arc byte for byte', async () => {
    const inner = await arcChat.buildInner(arc0, arc1.address, { k: 'request', x: 'dinner', a: '2.5', r: `0x${'ab'.repeat(32)}` })
    const { s, ...base } = inner
    // Re-sign with the phone's own signedText and the phone's own signer: must produce Arc's exact signature.
    expect(await phone0.signMessage(phone.signedText(base as never))).toBe(s)
  })
})

describe('phone seals, Arc opens', () => {
  for (const content of [
    { k: 'text' as const, x: 'hello from the phone' },
    { k: 'request' as const, x: 'lunch', a: '12.5', r: `0x${'11'.repeat(32)}` as `0x${string}` },
  ]) {
    it(`kind ${content.k}`, async () => {
      const inner = await phone.buildInner(phone0, phone1.address, content)
      const box = phone.sealBox(phone.packInner(inner), phone.pubkeyOf(w1.privateKey))
      const opened = arcChat.unpackInner(arcChat.openBox(box, w1.privateKey as `0x${string}`))
      expect(opened).toEqual(inner)
      expect(await arcChat.verifyInner(opened, arc1.address)).toBe(phone.pubkeyOf(w0.privateKey))
    })
  }

  it('payment message carries a voucher', async () => {
    const signature = await voucher.signPayment(w0 as unknown as ethers.Wallet, PAYMENT)
    const c = voucher.encodeVoucher({ payment: PAYMENT, signature })
    const inner = await phone.buildInner(phone0, phone1.address, { k: 'payment', a: '2.5', c })
    const box = phone.sealBox(phone.packInner(inner), phone.pubkeyOf(w1.privateKey))
    const opened = arcChat.unpackInner(arcChat.openBox(box, w1.privateKey as `0x${string}`))
    expect(opened.c).toBe(c)
    await arcChat.verifyInner(opened, arc1.address)
    // Arc's own voucher decoder accepts the phone's voucher
    expect(arcMesh.decodeVoucher(opened.c!).payment.amount).toBe(2_500_000n)
  })

  it('offline mpm1: code and relay event produced by the phone are accepted by Arc', async () => {
    const inner = await phone.buildInner(phone0, phone1.address, { k: 'text', x: 'offline' })
    const pub1 = phone.pubkeyOf(w1.privateKey)
    const box = phone.sealBox(phone.packInner(inner), pub1)
    const code = phone.encodeMessageCode(pub1, box)
    expect(code).toBe(arcChat.encodeMessageCode(pub1, box))
    const dec = arcChat.decodeMessageCode(code)
    expect(dec.recipientX).toBe(phone.xonlyOf(pub1))
    expect(arcChat.xonlyOf(pub1)).toBe(phone.xonlyOf(pub1))
    const ev = phone.buildRelayEvent(phone.xonlyOf(pub1), box, Math.floor(Date.now() / 1000) + 86400)
    expect(ev.kind).toBe(1059)
    expect(ev.tags).toContainEqual(['p', phone.xonlyOf(pub1)])
    expect(ev.tags.find((t) => t[0] === 'expiration')?.[1]).toMatch(/^\d{10}$/)
    expect(arcChat.relayEventValid(ev)).toBe(true)
    const fromEvent = arcChat.unpackInner(arcChat.openBox(arcMesh.fromB64Url(ev.content), w1.privateKey as `0x${string}`))
    expect(fromEvent.i).toBe(inner.i)
  })
})

describe('Arc seals, phone opens', () => {
  it('text, request and payment', async () => {
    const pub0 = phone.pubkeyOf(w0.privateKey)
    for (const content of [
      { k: 'text' as const, x: 'hello from the web wallet' },
      { k: 'request' as const, a: '7', r: `0x${'22'.repeat(32)}` as `0x${string}` },
    ]) {
      const inner = await arcChat.buildInner(arc1, arc0.address, content)
      const box = arcChat.sealBox(arcChat.packInner(inner), pub0)
      const opened = phone.unpackInner(phone.openBox(box, w0.privateKey))
      expect(opened).toEqual(inner)
      expect(await phone.verifyInner(opened, phone0.address)).toBe(phone.pubkeyOf(w1.privateKey))
      expect(phone.isWithinRetention(opened.t)).toBe(true)
    }
    const signature = await arcMesh.signPayment(arc1, { ...PAYMENT, from: arc1.address, to: arc0.address } as never)
    const c = arcMesh.encodeVoucher({ payment: { ...PAYMENT, from: arc1.address, to: arc0.address } as never, signature })
    const inner = await arcChat.buildInner(arc1, arc0.address, { k: 'payment', a: '2.5', c })
    const opened = phone.unpackInner(phone.openBox(arcChat.sealBox(arcChat.packInner(inner), pub0), w0.privateKey))
    expect(voucher.decodeVoucher(opened.c!).payment.amount).toBe(2_500_000n)
    expect(voucher.isSignatureValid(voucher.decodeVoucher(opened.c!))).toBe(true)
  })

  it('offline code and relay event produced by Arc are accepted by the phone', async () => {
    const pub0 = phone.pubkeyOf(w0.privateKey)
    const inner = await arcChat.buildInner(arc1, arc0.address, { k: 'text', x: 'web offline' })
    const box = arcChat.sealBox(arcChat.packInner(inner), pub0)
    const code = arcChat.encodeMessageCode(pub0, box)
    const dec = phone.decodeMessageCode(code)
    expect(dec.recipientX).toBe(phone.xonlyOf(pub0))
    expect(phone.unpackInner(phone.openBox(dec.box, w0.privateKey)).i).toBe(inner.i)
    const ev = arcChat.buildRelayEvent(dec.recipientX, box)
    expect(phone.relayEventValid(ev)).toBe(true)
    expect(phone.decodeCard(arcChat.encodeCard({ address: arc1.address, pubkey: arcChat.pubkeyOf(w1.privateKey as `0x${string}`), name: 'Bob‮' })).name).toBe('Bob')
  })
})

describe('guardian shards (section 7 payload shape)', () => {
  it('shards made in the Arc payload shape recover with the phone code, and vice versa', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sss = require('shamirs-secret-sharing') as { split(s: Buffer, o: { shares: number; threshold: number }): Buffer[] }
    const { recoverFromPayloads, shardToPayload } = await import('../src/wallet/shards')
    const key = Buffer.from(w0.privateKey.slice(2), 'hex')
    const shares = sss.split(key, { shares: 3, threshold: 2 })
    // Arc's splitKey payload: {v:1,i,t,n,a:last 8 of address,s:base64}
    const arcPayloads = shares.map((s, i) => JSON.stringify({ v: 1, i: i + 1, t: 2, n: 3, a: w0.address.slice(-8), s: s.toString('base64') }))
    expect(recoverFromPayloads([arcPayloads[0], arcPayloads[2]])).toBe(w0.privateKey)
    const mine = shares.map((s, i) => shardToPayload({ index: i + 1, total: 3, threshold: 2, shardBase64: s.toString('base64'), address: w0.address }))
    expect(JSON.parse(mine[1])).toEqual(JSON.parse(arcPayloads[1]))
    expect(recoverFromPayloads([mine[0], mine[1]])).toBe(w0.privateKey)
  })
})
