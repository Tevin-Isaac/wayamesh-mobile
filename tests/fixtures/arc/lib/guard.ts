import { zeroAddress, type Address } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { CHAIN, MESHPAY_ADDRESS } from './mesh'

/**
 * Address poisoning guard: attackers send dust from an address that starts and ends like one you
 * know, hoping you copy it later. Returns the real address when `to` only looks like it.
 */
export function lookalike(to: string, known: Address[]): Address | null {
  const t = to.toLowerCase()
  for (const k of known) {
    const a = k.toLowerCase()
    if (a === t) return null
  }
  for (const k of known) {
    const a = k.toLowerCase()
    if (a.slice(0, 6) === t.slice(0, 6) && a.slice(-4) === t.slice(-4)) return k
  }
  return null
}

/** Groups an address into blocks of four so every character can be checked by eye. */
export function groupAddress(address: string): string {
  return address.slice(2).replace(/(.{4})/g, '$1 ').trim()
}

/** Sending to these addresses would lose the money. Returns the reason, or null when the address is fine. */
export function unsafeRecipient(to: string): string | null {
  const t = to.toLowerCase()
  if (t === zeroAddress) return 'That is the empty address. Money sent there is lost.'
  const usdc = getUsdc(CHAIN.id)?.address?.toLowerCase()
  if (usdc && t === usdc) return 'That is the USDC token contract. Money sent there is lost.'
  if (t === MESHPAY_ADDRESS.toLowerCase()) return 'That is the settlement contract. Pay a person, not the contract.'
  return null
}
