import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { recoverMessageAddress } from 'viem'
import { normalizeKenyanPhone, previewOfframp, previewOnramp, rampAuthMessage } from '@/lib/ramp'

const acct = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

describe('ramp auth message', () => {
  it('is exactly the documented format for onramp', () => {
    expect(rampAuthMessage({ action: 'onramp', address: acct.address.toLowerCase(), phone: '254712345678', amount: 1000, issuedAt: 1700000000000 })).toBe(
      'Wayamesh ramp\nAction: onramp\nAddress: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\nPhone: 254712345678\nAmount: 1000\nIssued: 1700000000000',
    )
  })

  it('is exactly the documented format for offramp (USDC string, checksummed address)', () => {
    expect(rampAuthMessage({ action: 'offramp', address: acct.address, phone: '254712345678', amount: '5.25', issuedAt: 1700000000001 })).toBe(
      'Wayamesh ramp\nAction: offramp\nAddress: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\nPhone: 254712345678\nAmount: 5.25\nIssued: 1700000000001',
    )
  })

  it('signature recovers to the wallet (EIP-191 personal_sign)', async () => {
    const message = rampAuthMessage({ action: 'onramp', address: acct.address, phone: '254712345678', amount: 500, issuedAt: 1 })
    const signature = await acct.signMessage({ message })
    expect(await recoverMessageAddress({ message, signature })).toBe(acct.address)
  })
})

describe('phone + preview helpers', () => {
  it('normalizes Kenyan numbers', () => {
    for (const p of ['0712345678', '712345678', '+254712345678', '254 712 345 678', '0712-345-678']) expect(normalizeKenyanPhone(p)).toBe('254712345678')
    expect(normalizeKenyanPhone('0112345678')).toBe('254112345678')
    expect(normalizeKenyanPhone('12345')).toBeNull()
    expect(normalizeKenyanPhone('0212345678')).toBeNull()
  })
  it('previews net of fee', () => {
    const cfg = { usdKes: 130, feeBps: 100 }
    expect(previewOnramp(1300, cfg)).toBeCloseTo(9.9, 6)
    expect(previewOfframp(10, cfg)).toBeCloseTo(1287, 6)
    expect(previewOnramp(0, cfg)).toBe(0)
  })
})
