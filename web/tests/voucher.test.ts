import { describe, expect, it } from 'vitest'
import { hashTypedData, recoverTypedDataAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  VOUCHER_BYTES, VOUCHER_PREFIX, ZERO_REF, decodeVoucher, domain, encodeVoucher, fromB64Url, isSignatureValid, signPayment, signerOf,
  TYPES, voucherId, parseAddressQr, type Payment,
} from '@/lib/mesh'
import { MESHPAY_ADDRESS } from '@/lib/chain'

const account = privateKeyToAccount(generatePrivateKey())
const recipient = privateKeyToAccount(generatePrivateKey()).address

function payment(over: Partial<Payment> = {}): Payment {
  return {
    from: account.address,
    to: recipient,
    amount: 12_345_678n,
    fee: 1_000n,
    nonce: 0x1122334455667788n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    ref: ZERO_REF,
    ...over,
  }
}

describe('mp2 voucher wire format', () => {
  it('round-trips and is exactly 178 bytes', async () => {
    const p = payment({ ref: `0x${'ab'.repeat(32)}` })
    const signature = await signPayment(account, p)
    const code = encodeVoucher({ payment: p, signature })
    expect(code.startsWith('mp2:')).toBe(true)
    expect(VOUCHER_PREFIX).toBe('mp2:')
    expect(fromB64Url(code.slice(4)).length).toBe(VOUCHER_BYTES)
    expect(VOUCHER_BYTES).toBe(178)
    const back = decodeVoucher(code)
    expect(back.payment).toEqual(p)
    expect(back.signature).toBe(signature)
    expect(voucherId(back.payment)).toBe(`${account.address.toLowerCase()}:${p.nonce.toString()}`)
  })

  it('uses the documented byte layout (1|20|20|16|8|8|8|32|65)', async () => {
    const p = payment()
    const signature = await signPayment(account, p)
    const b = fromB64Url(encodeVoucher({ payment: p, signature }).slice(4))
    expect(b[0]).toBe(2)
    expect(Buffer.from(b.slice(1, 21)).toString('hex')).toBe(p.from.slice(2).toLowerCase())
    expect(Buffer.from(b.slice(21, 41)).toString('hex')).toBe(p.to.slice(2).toLowerCase())
    expect(BigInt('0x' + Buffer.from(b.slice(41, 57)).toString('hex'))).toBe(p.amount)
    expect(BigInt('0x' + Buffer.from(b.slice(57, 65)).toString('hex'))).toBe(p.fee)
    expect(BigInt('0x' + Buffer.from(b.slice(65, 73)).toString('hex'))).toBe(p.nonce)
    expect(BigInt('0x' + Buffer.from(b.slice(73, 81)).toString('hex'))).toBe(p.deadline)
    expect('0x' + Buffer.from(b.slice(113, 178)).toString('hex')).toBe(signature)
  })

  it('rejects damaged codes', async () => {
    const p = payment()
    const code = encodeVoucher({ payment: p, signature: await signPayment(account, p) })
    expect(() => decodeVoucher('hello')).toThrow()
    expect(() => decodeVoucher(code.slice(0, -4))).toThrow()
    expect(() => decodeVoucher('mp2:@@@@')).toThrow()
  })

  it('parses address QR payloads', () => {
    expect(parseAddressQr(`ethereum:${recipient}`)).toBe(recipient)
    expect(parseAddressQr(recipient.toLowerCase())).toBe(recipient)
    expect(parseAddressQr('nope')).toBeNull()
  })
})

describe('EIP-712 signing', () => {
  it('recovers the signer and detects tampering', async () => {
    const p = payment()
    const signature = await signPayment(account, p)
    expect(await signerOf({ payment: p, signature })).toBe(account.address)
    expect(await isSignatureValid({ payment: p, signature })).toBe(true)
    expect(await isSignatureValid({ payment: { ...p, amount: p.amount + 1n }, signature })).toBe(false)
    expect(await isSignatureValid({ payment: { ...p, to: account.address }, signature })).toBe(false)
  })

  it('binds the MeshPayV2 domain (name, version 2, Arc chain, contract)', async () => {
    const d = domain()
    expect(d).toEqual({ name: 'MeshPay', version: '2', chainId: 5042002, verifyingContract: MESHPAY_ADDRESS })
    expect(MESHPAY_ADDRESS.toLowerCase()).toBe('0xd619b77bb8389a632800c300969ef152099f7691')
    const p = payment()
    const signature = await signPayment(account, p)
    const other = '0x0000000000000000000000000000000000000001'
    const wrong = await recoverTypedDataAddress({ domain: domain(other), types: TYPES, primaryType: 'Payment', message: p, signature })
    expect(wrong).not.toBe(account.address)
    // digest is deterministic
    expect(hashTypedData({ domain: d, types: TYPES, primaryType: 'Payment', message: p })).toBe(
      hashTypedData({ domain: d, types: TYPES, primaryType: 'Payment', message: { ...p } }),
    )
  })
})
