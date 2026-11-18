import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DERIVATION_PATH, accountFromSecret, newMnemonic, parseSecret, normalizeMnemonic } from '@/lib/identity'

const TEST_PHRASE = 'test test test test test test test test test test test junk'

describe('seed phrase -> address', () => {
  it("uses m/44'/60'/0'/0/0 and matches the well-known vector", () => {
    expect(DERIVATION_PATH).toBe("m/44'/60'/0'/0/0")
    const acc = accountFromSecret(parseSecret(TEST_PHRASE))
    expect(acc.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })

  it('generates valid 12 and 24 word phrases that re-import to the same address', () => {
    for (const n of [12, 24] as const) {
      const m = newMnemonic(n)
      expect(m.split(' ')).toHaveLength(n)
      const a = accountFromSecret(parseSecret(m)).address
      expect(accountFromSecret(parseSecret(`  ${m.toUpperCase()}  `)).address).toBe(a)
    }
  })

  it('rejects bad phrases and accepts private keys', () => {
    expect(() => parseSecret('one two three')).toThrow(/12 or 24/)
    expect(() => parseSecret(TEST_PHRASE.replace('junk', 'zzzz'))).toThrow(/Invalid seed phrase/)
    const pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    expect(parseSecret(pk).kind).toBe('privateKey')
    expect(accountFromSecret(parseSecret(pk.slice(2))).address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(normalizeMnemonic(' A  b\nc ')).toBe('a b c')
  })

  // Parity with the phone app, which derives with ethers HDNodeWallet.fromPhrase(mnemonic, undefined, path).
  const mobileEthers = '/home/tevin/Documents/wayamesh-mobile/node_modules/ethers'
  const it2 = existsSync(mobileEthers) ? it : it.skip
  it2('matches the mobile app derivation (ethers) for random 12 and 24 word phrases', () => {
    const ethers = createRequire(import.meta.url)(mobileEthers)
    const path = "m/44'/60'/0'/0/0"
    for (const bytes of [16, 32, 16, 32, 32]) {
      const phrase = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(bytes))
      const mobile = ethers.HDNodeWallet.fromPhrase(phrase, undefined, path)
      const web = accountFromSecret(parseSecret(phrase))
      expect(web.address).toBe(ethers.getAddress(mobile.address))
    }
    const m = ethers.HDNodeWallet.fromPhrase(TEST_PHRASE, undefined, path)
    expect(m.address).toBe(accountFromSecret(parseSecret(TEST_PHRASE)).address)
  })
})
