import type { Address, Hex } from 'viem'
import { VOUCHER_TTL_SECONDS, ZERO_REF, encodeVoucher, randomNonce, signPayment, type Payment } from './mesh'
import { makeItem, toVoucher } from './items'
import { getAccount } from './session'
import { addItem, type StoredItem } from './store'

export class PaymentBlocked extends Error {}

export interface SignOptions {
  /** Offline balance available (reserve minus unsettled payments). Null = unknown, not enforced. */
  spendable?: bigint | null
  fee?: bigint
  ref?: Hex
}

/**
 * Builds and signs a MeshPayV2 payment on the device. No network: the key seals the payment and the receiver
 * (or any courier) can settle it from the reserve. Records it in the local store.
 */
export async function createSignedPayment(to: Address, amount: bigint, opts: SignOptions = {}): Promise<{ item: StoredItem; code: string }> {
  const account = getAccount()
  const fee = opts.fee ?? 0n
  if (amount <= 0n) throw new PaymentBlocked('Enter an amount above zero.')
  if (to.toLowerCase() === account.address.toLowerCase()) throw new PaymentBlocked('That is this wallet. Pick another address.')
  if (opts.spendable !== undefined && opts.spendable !== null && amount + fee > opts.spendable) {
    throw new PaymentBlocked('That is more than your offline balance. Add to your reserve first.')
  }
  const payment: Payment = {
    from: account.address,
    to,
    amount,
    fee,
    nonce: randomNonce(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS),
    ref: opts.ref ?? ZERO_REF,
  }
  const signature = await signPayment(account, payment)
  const item = makeItem({ payment, signature }, 'signed')
  addItem(item)
  return { item, code: encodeVoucher(toVoucher(item)) }
}
