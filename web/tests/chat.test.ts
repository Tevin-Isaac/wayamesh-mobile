import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Wallet } from 'ethers'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import * as web from '@/lib/chat/crypto'
import * as phone from '../../src/chat/crypto'

const te = new TextEncoder()

function webIdentity() {
  const pk = generatePrivateKey()
  const account = privateKeyToAccount(pk)
  const chatKey = web.deriveChatKey(pk)
  return { pk, address: account.address.toLowerCase(), chatKey, pub: web.chatPubkeyOf(chatKey), signer: { address: account.address, signMessage: (m: string) => account.signMessage({ message: m }) } }
}
function phoneIdentity() {
  const w = Wallet.createRandom()
  const chatKey = phone.deriveChatKey(w.privateKey)
  return { pk: w.privateKey, address: w.address.toLowerCase(), chatKey, pub: phone.chatPubkeyOf(chatKey), signer: { address: w.address, signMessage: (m: string) => w.signMessage(m) } }
}

describe('chat crypto (web copy)', () => {
  it('round trips a sealed message', () => {
    const a = webIdentity(), b = webIdentity()
    const inner = web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'habari' })
    const box = web.sealMessage(inner, b.pub)
    const { inner: got } = web.openMessage(box, b.chatKey, b.address)
    expect(got.x).toBe('habari')
    expect(got.f).toBe(a.address)
  })
  it('fails with the wrong key', () => {
    const a = webIdentity(), b = webIdentity(), c = webIdentity()
    const box = web.sealMessage(web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'hi' }), b.pub)
    expect(() => web.openMessage(box, c.chatKey, b.address)).toThrow()
  })
  it('rejects tampered ciphertext', () => {
    const a = webIdentity(), b = webIdentity()
    const box = web.sealMessage(web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'hi' }), b.pub)
    box[box.length - 5] ^= 1
    expect(() => web.openMessage(box, b.chatKey, b.address)).toThrow()
  })
  it('rejects a message addressed to someone else and a forged sender signature', () => {
    const a = webIdentity(), b = webIdentity(), c = webIdentity()
    const inner = web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'hi' })
    expect(() => web.verifyInner(inner, c.address)).toThrow()
    expect(() => web.verifyInner({ ...inner, x: 'changed' }, b.address)).toThrow()
  })
  it('derives a chat key that differs from the wallet key and is deterministic', () => {
    const a = webIdentity()
    expect('0x' + a.chatKey).not.toBe(a.pk)
    expect(web.deriveChatKey(a.pk)).toBe(a.chatKey)
  })
  it('verifies a genuine card and rejects forgeries', async () => {
    const a = webIdentity(), m = webIdentity()
    const card = await web.buildCard(a.signer, a.pub, 'Amina')
    const d = web.decodeCard(card)
    expect(d).toEqual({ address: a.address, pubkey: a.pub, name: 'Amina' })
    // attacker swaps in their own chat key but keeps Amina's address and signature
    const bytes = web.fromB64Url(card.slice(web.CARD_PREFIX.length))
    bytes.set(Buffer.from(m.pub, 'hex'), 20)
    expect(() => web.decodeCard(web.CARD_PREFIX + web.toB64Url(bytes))).toThrow()
    // attacker signs their own key with their own wallet but claims Amina's address
    const forged = await web.buildCard({ address: a.address, signMessage: m.signer.signMessage }, m.pub, 'Amina')
    expect(() => web.decodeCard(forged)).toThrow()
    // truncated
    expect(() => web.decodeCard(card.slice(0, -6))).toThrow()
  })
  it('a card attached to a message must match the sender', async () => {
    const a = webIdentity(), b = webIdentity(), m = webIdentity()
    const cardM = await web.buildCard(m.signer, m.pub, 'm')
    const inner = web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'x' }, cardM)
    expect(() => web.verifyInner(inner, b.address)).toThrow()
  })
  it('message code round trips and relay events validate', () => {
    const a = webIdentity(), b = webIdentity()
    const box = web.sealMessage(web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'offline' }), b.pub)
    const code = web.encodeMessageCode(b.pub, box)
    const dec = web.decodeMessageCode(code)
    expect(dec.recipientX).toBe(web.xonlyOf(b.pub))
    const ev = web.buildRelayEvent(dec.recipientX, dec.box)
    expect(web.relayEventValid(ev)).toBe(true)
    expect(web.relayEventValid({ ...ev, content: ev.content + 'A' })).toBe(false)
  })
})

describe('phone <-> web compatibility', () => {
  it('the two protocol copies are byte identical', () => {
    for (const f of ['crypto.ts', 'relay.ts']) {
      expect(readFileSync(new URL(`../src/lib/chat/${f}`, import.meta.url), 'utf8')).toBe(readFileSync(new URL(`../../src/chat/${f}`, import.meta.url), 'utf8'))
    }
  })
  it('web seals, phone opens (with a payment code and attached card)', async () => {
    const w = webIdentity(), p = phoneIdentity()
    const card = await web.buildCard(w.signer, w.pub, 'Web')
    const inner = web.buildInner(w.chatKey, w.address, p.address, { k: 'payment', x: 'for lunch', a: '1.5', c: 'mp2:abc' }, card)
    const code = web.encodeMessageCode(p.pub, web.sealMessage(inner, p.pub))
    const { box } = phone.decodeMessageCode(code)
    const got = phone.openMessage(box, p.chatKey, p.address)
    expect(got.inner.c).toBe('mp2:abc')
    expect(got.card?.address).toBe(w.address)
  })
  it('phone seals, web opens', async () => {
    const w = webIdentity(), p = phoneIdentity()
    const card = await phone.buildCard(p.signer, p.pub, 'Phone')
    const inner = phone.buildInner(p.chatKey, p.address, w.address, { k: 'text', x: 'from phone' }, card)
    const box = phone.sealMessage(inner, w.pub)
    const got = web.openMessage(box, w.chatKey, w.address)
    expect(got.inner.x).toBe('from phone')
    expect(got.card?.pubkey).toBe(p.pub)
  })
  it('cards signed by ethers verify in the web copy and vice versa; same key derivation', async () => {
    const p = phoneIdentity(), w = webIdentity()
    expect(web.decodeCard(await phone.buildCard(p.signer, p.pub, 'P')).address).toBe(p.address)
    expect(phone.decodeCard(await web.buildCard(w.signer, w.pub, 'W')).address).toBe(w.address)
    expect(web.deriveChatKey(p.pk)).toBe(p.chatKey)
  })
  it('relay event content from one is valid for the other', () => {
    const a = webIdentity()
    const ev = phone.buildRelayEvent(web.xonlyOf(a.pub), te.encode('x'.repeat(100)))
    expect(web.relayEventValid(ev)).toBe(true)
  })
})

describe('card rename', () => {
  it('keeps the signature valid when only the label changes', async () => {
    const a = webIdentity()
    const card = await web.buildCard(a.signer, a.pub, 'Old')
    const renamed = web.renameCard(card, 'New name')
    expect(web.decodeCard(renamed)).toEqual({ address: a.address, pubkey: a.pub, name: 'New name' })
  })
})

describe('chat key from a seed phrase', () => {
  it('web (viem HD key) and phone (ethers HD key) derive the same chat key and address', async () => {
    const { walletPrivateKeyOf, accountFromSecret } = await import('@/lib/identity')
    const { HDNodeWallet } = await import('ethers')
    const phrase = 'test test test test test test test test test test test junk'
    const webPk = walletPrivateKeyOf({ kind: 'mnemonic', value: phrase })
    const ph = HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0")
    expect(webPk).toBe(ph.privateKey)
    expect(web.deriveChatKey(webPk)).toBe(phone.deriveChatKey(ph.privateKey))
    expect(accountFromSecret({ kind: 'mnemonic', value: phrase }).address).toBe(ph.address)
  })
})

describe('24 hour expiry', () => {
  it('stamps expiry 24h ahead, signed with the message, and adds the NIP-40 tag', () => {
    const a = webIdentity(), b = webIdentity()
    const inner = web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'hi' })
    expect(inner.e - inner.t).toBe(86400)
    expect(() => web.verifyInner({ ...inner, e: inner.e + 100 }, b.address)).toThrow() // expiry is covered by the signature
    const box = web.sealMessage(inner, b.pub)
    const ev = web.buildRelayEvent(web.xonlyOf(b.pub), box, inner.e)
    expect(ev.tags).toContainEqual(['expiration', String(inner.e)])
    expect(web.relayEventValid(ev)).toBe(true)
  })
  it('rejects a message whose expiry has passed, accepts it just before', () => {
    const a = webIdentity(), b = webIdentity()
    const old = Date.now() - 25 * 3600 * 1000
    const inner = web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'stale' }, undefined, old)
    const box = web.sealMessage(inner, b.pub)
    expect(() => web.openMessage(box, b.chatKey, b.address)).toThrow(/expired/)
    expect(web.openMessage(box, b.chatKey, b.address, inner.e - 1).inner.x).toBe('stale')
    expect(() => web.openMessage(box, b.chatKey, b.address, inner.e)).toThrow(/expired/)
  })
  it('rejects an absurdly long expiry and over-long text', () => {
    const a = webIdentity(), b = webIdentity()
    const far = web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'x' }, undefined, Date.now() + 5 * 86400 * 1000)
    expect(() => web.verifyInner(far, b.address)).toThrow()
    expect(() => web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'x'.repeat(1001) })).toThrow()
    expect(web.buildInner(a.chatKey, a.address, b.address, { k: 'text', x: 'x'.repeat(1000) }).x).toHaveLength(1000)
  })
})

describe('chat purge (web store)', () => {
  const ME = '0x00000000000000000000000000000000000000aa'
  const P1 = '0x0000000000000000000000000000000000000001' as const
  const P2 = '0x0000000000000000000000000000000000000002' as const
  it('drops expired messages but keeps contacts, payments and meta', async () => {
    const s = await import('@/lib/store')
    s.bindStore(ME)
    s.upsertContact({ address: P1, name: 'One', addedAt: 1, pubkey: 'ab', phone: '+254' })
    s.addItem({ id: 'v1', source: 'received', from: P1, to: ME as `0x${string}`, amount: '1', fee: '0', nonce: '1', deadline: '9', ref: '0x00', signature: '0x00', createdAt: 1, status: 'pending' })
    s.setChatMeta({ card: 'mpc1:x', since: 5 })
    const now = Date.now()
    s.putMessage({ peer: P1, dir: 'in', kind: 'text', body: 'old', ts: now - 25 * 3600_000, mid: 'old' })
    s.putMessage({ peer: P1, dir: 'in', kind: 'payment', amount: '1', itemId: 'v1', ts: now - 24 * 3600_000 - 1, mid: 'oldpay' })
    s.putMessage({ peer: P1, dir: 'in', kind: 'text', body: 'fresh', ts: now - 3600_000, mid: 'fresh' })
    expect(s.getData().messages.map((m) => m.mid)).toEqual(['fresh'])
    expect(s.getData().contacts).toHaveLength(1)
    expect(s.getData().contacts[0].phone).toBe('+254')
    expect(s.getData().items.map((i) => i.id)).toEqual(['v1'])
    expect(s.getData().items[0].status).toBe('pending')
    expect(s.getData().chat).toEqual({ card: 'mpc1:x', since: 5 })
    // dedupe by id still works
    expect(s.putMessage({ peer: P1, dir: 'in', kind: 'text', body: 'again', ts: now, mid: 'fresh' })).toBe(false)
    // an explicit purge 25h later removes the rest, nothing else
    expect(s.purgeChat(now + 25 * 3600_000)).toBe(1)
    expect(s.getData().messages).toEqual([])
    expect(s.getData().contacts).toHaveLength(1)
    expect(s.getData().items).toHaveLength(1)
  })
  it('caps each thread at 200 and the store at 1000, dropping oldest', async () => {
    const s = await import('@/lib/store')
    s.bindStore(ME)
    const now = Date.now()
    for (let i = 0; i < 230; i++) s.putMessage({ peer: P1, dir: 'out', kind: 'text', body: String(i), ts: now - (230 - i) * 1000, mid: `a${i}` })
    expect(s.getData().messages.filter((m) => m.peer === P1)).toHaveLength(200)
    expect(s.getData().messages.find((m) => m.mid === 'a0')).toBeUndefined()
    expect(s.getData().messages.find((m) => m.mid === 'a229')).toBeDefined()
    for (let i = 0; i < 6; i++) {
      const peer = `0x00000000000000000000000000000000000000${(10 + i).toString(16).padStart(2, '0')}` as `0x${string}`
      for (let j = 0; j < 200; j++) s.putMessage({ peer, dir: 'in', kind: 'text', body: 'x', ts: now + i * 1000 + j, mid: `b${i}-${j}` })
    }
    expect(s.getData().messages.length).toBeLessThanOrEqual(1000)
    void P2
  })
})
