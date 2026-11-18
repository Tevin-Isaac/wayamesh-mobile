import { MAX_ACCEPTED_TTL_SECONDS, decodeVoucher, isSignatureValid, type Voucher } from './mesh'
import { makeItem } from './items'
import { addItem, getData, type StoredItem } from './store'
import { parseUsdc } from './money'

export interface Inspected {
  voucher: Voucher
  /** Reasons the payment cannot be accepted. Empty when the code is valid. */
  problem: string | null
}

/** Decodes and fully verifies a payment code (shape, deadline window, signature) without storing it. */
export async function inspectVoucher(code: string, now = Date.now()): Promise<Inspected> {
  const voucher = decodeVoucher(code)
  const { deadline } = voucher.payment
  const t = BigInt(Math.floor(now / 1000))
  let problem: string | null = null
  if (voucher.payment.amount <= 0n) problem = 'This payment has no amount.'
  else if (deadline === 0n || t > deadline) problem = 'This payment has expired.'
  else if (deadline > t + BigInt(MAX_ACCEPTED_TTL_SECONDS)) problem = 'This payment stays valid too long to be safe. Ask for a new one.'
  else if (!(await isSignatureValid(voucher))) problem = 'The signature does not match. This payment is not valid.'
  return { voucher, problem }
}

export interface IngestedVoucher {
  item: StoredItem
  added: boolean
}

/** Stores a verified payment so this device can settle it when online. Throws if verification fails. */
export async function ingestVoucher(code: string): Promise<IngestedVoucher> {
  const { voucher, problem } = await inspectVoucher(code)
  if (problem) throw new Error(problem)
  let limit = 0n
  try {
    limit = parseUsdc(getData().settings.acceptLimit)
  } catch {
    limit = 0n
  }
  const item: StoredItem = { ...makeItem(voucher, 'received'), risky: limit > 0n && voucher.payment.amount > limit }
  const added = addItem(item)
  return { item, added }
}
