/**
 * Wallet identity. Same derivation as the phone app (ethers HDNodeWallet.fromPhrase with the default
 * Ethereum path m/44'/60'/0'/0/0), so one seed phrase yields one address on both.
 */
import { generateMnemonic, mnemonicToAccount, privateKeyToAccount, english, type HDAccount, type PrivateKeyAccount } from 'viem/accounts'
import { validateMnemonic } from '@scure/bip39'
import { getAddress, isHex, type Address, type Hex } from 'viem'

export const DERIVATION_PATH = "m/44'/60'/0'/0/0"

export type Secret = { kind: 'mnemonic'; value: string } | { kind: 'privateKey'; value: Hex }

export type Account = HDAccount | PrivateKeyAccount

export function newMnemonic(words: 12 | 24 = 12): string {
  return generateMnemonic(english, words === 24 ? 256 : 128)
}

export function normalizeMnemonic(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}

export function normalizePrivateKey(input: string): Hex | null {
  const t = input.trim()
  const hex = t.startsWith('0x') || t.startsWith('0X') ? t.slice(2) : t
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null
  const k = `0x${hex.toLowerCase()}` as Hex
  return isHex(k) ? k : null
}

/** Parses a user-supplied seed phrase or private key. Throws a readable error when invalid. */
export function parseSecret(input: string): Secret {
  const t = input.trim()
  if (!t) throw new Error('Enter a private key or seed phrase')
  const pk = normalizePrivateKey(t)
  if (pk) return { kind: 'privateKey', value: pk }
  const phrase = normalizeMnemonic(t)
  const n = phrase.split(' ').length
  if (n !== 12 && n !== 24) throw new Error('Seed phrase must be 12 or 24 words')
  // viem's mnemonicToAccount does not check the word list or checksum, so validate explicitly (as ethers does on the phone).
  if (!validateMnemonic(phrase, english)) throw new Error('Invalid seed phrase. Check the spelling of every word.')
  return { kind: 'mnemonic', value: phrase }
}

export function accountFromSecret(secret: Secret): Account {
  return secret.kind === 'mnemonic' ? mnemonicToAccount(secret.value) : privateKeyToAccount(secret.value)
}

export function addressOf(secret: Secret): Address {
  return getAddress(accountFromSecret(secret).address)
}
