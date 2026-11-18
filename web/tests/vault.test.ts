import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, isVaultRecord, pinProblem, PBKDF2_ITERATIONS } from '@/lib/vault'
import { accountFromSecret, parseSecret } from '@/lib/identity'

const PHRASE = 'test test test test test test test test test test test junk'
const FAST = 2000 // production uses PBKDF2_ITERATIONS; low here only to keep the test quick

describe('PIN vault (PBKDF2 + AES-GCM)', () => {
  it('production iteration count is 600k', () => expect(PBKDF2_ITERATIONS).toBe(600_000))

  it('encrypts and decrypts, with no plaintext in the record', async () => {
    const secret = parseSecret(PHRASE)
    const rec = await encryptSecret(secret, '482915', FAST)
    expect(isVaultRecord(rec)).toBe(true)
    expect(rec.address).toBe(accountFromSecret(secret).address)
    const blob = JSON.stringify(rec)
    expect(blob).not.toContain('junk')
    expect(blob).not.toContain('test test')
    expect(await decryptSecret(rec, '482915')).toEqual(secret)
  })

  it('uses a fresh salt and iv every time', async () => {
    const s = parseSecret(PHRASE)
    const a = await encryptSecret(s, '482915', FAST)
    const b = await encryptSecret(s, '482915', FAST)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)
  })

  it('fails on a wrong PIN or a tampered record', async () => {
    const rec = await encryptSecret(parseSecret(PHRASE), '482915', FAST)
    await expect(decryptSecret(rec, '000111')).rejects.toBeTruthy()
    await expect(decryptSecret({ ...rec, address: '0x0000000000000000000000000000000000000001' }, '482915')).rejects.toBeTruthy()
    const ct = rec.ct.slice(0, -4) + (rec.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    await expect(decryptSecret({ ...rec, ct }, '482915')).rejects.toBeTruthy()
  })

  it('seals private-key wallets too', async () => {
    const s = parseSecret('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    expect(await decryptSecret(await encryptSecret(s, 'correct horse', FAST), 'correct horse')).toEqual(s)
  })

  it('rejects weak PINs', () => {
    expect(pinProblem('123')).toMatch(/at least 6/)
    expect(pinProblem('111111')).toBeTruthy()
    expect(pinProblem('123456')).toBeTruthy()
    expect(pinProblem('654321')).toBeTruthy()
    expect(pinProblem('482915')).toBeNull()
    expect(pinProblem('a long passphrase')).toBeNull()
  })
})
