import { useCallback, useEffect, useRef, useState } from 'react'
import { createWalletClient, erc20Abi, formatEther, http, parseEventLogs, type Address, type Hex } from 'viem'
import { CHAIN, MESHPAY_ADDRESS, USDC_ADDRESS, publicClient } from './chain'
import { MESHPAY_ABI, REJECT_LABELS } from './mesh'
import { getAccount } from './session'
import { addActivity, setCache, updateItem, useData, type StoredItem } from './store'
import { toPayment } from './items'
import { getOnline, useOnline } from './net'

function wallet() {
  return createWalletClient({ account: getAccount(), chain: CHAIN, transport: http() })
}

// ---- reads ----

export const readWalletUsdc = (a: Address) =>
  publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [a] })

export const readReserve = (a: Address) =>
  publicClient.readContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'reserve', args: [a] })

export async function readWithdrawal(a: Address): Promise<{ amount: bigint; unlockAt: bigint }> {
  const [amount, unlockAt] = await publicClient.readContract({
    address: MESHPAY_ADDRESS,
    abi: MESHPAY_ABI,
    functionName: 'withdrawalRequest',
    args: [a],
  })
  return { amount, unlockAt }
}

export const readAllowance = (owner: Address) =>
  publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [owner, MESHPAY_ADDRESS] })

// ---- writes (all signed by the device key; gas is paid in USDC on Arc) ----

async function confirm(hash: Hex): Promise<Hex> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The transaction reverted.')
  return hash
}

export async function sendUsdcOnline(to: Address, amount: bigint): Promise<Hex> {
  const hash = await wallet().writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [to, amount] })
  await confirm(hash)
  addActivity({ type: 'online', amount: amount.toString(), to, txHash: hash })
  return hash
}

/** approve (if needed) + deposit into this device's own reserve. */
export async function addToReserve(amount: bigint): Promise<Hex> {
  const me = getAccount().address
  const w = wallet()
  if ((await readAllowance(me)) < amount) {
    await confirm(await w.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [MESHPAY_ADDRESS, amount] }))
  }
  const hash = await confirm(await w.writeContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'deposit', args: [me, amount] }))
  addActivity({ type: 'deposit', amount: amount.toString(), txHash: hash })
  return hash
}

export async function requestWithdraw(amount: bigint): Promise<Hex> {
  return confirm(await wallet().writeContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'requestWithdraw', args: [amount] }))
}

export async function cancelWithdraw(): Promise<Hex> {
  return confirm(await wallet().writeContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'cancelWithdraw' }))
}

export async function finalizeWithdraw(pending: bigint): Promise<Hex> {
  const hash = await confirm(await wallet().writeContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'finalizeWithdraw' }))
  addActivity({ type: 'withdraw', amount: pending.toString(), txHash: hash })
  return hash
}

/** Burns the nonce of a payment you signed so it can never settle, then marks it cancelled. */
export async function cancelSignedPayment(item: StoredItem): Promise<Hex> {
  const hash = await confirm(
    await wallet().writeContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'cancelNonce', args: [BigInt(item.nonce)] }),
  )
  updateItem(item.id, { status: 'cancelled', txHash: hash, note: 'Cancelled on-chain' })
  return hash
}

/** Estimated network fee (USDC, since USDC is Arc's gas token) for an ERC-20 transfer; null if it cannot be estimated. */
export async function estimateTransferFee(from: Address, to: Address, amount: bigint): Promise<string | null> {
  try {
    const [gas, price] = await Promise.all([
      publicClient.estimateContractGas({ account: from, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [to, amount] }),
      publicClient.getGasPrice(),
    ])
    return formatEther(gas * price)
  } catch {
    return null
  }
}

export interface SettleResult {
  settled: number
  skipped: number
  hash?: Hex
  /** Courier tips earned for settling, in USDC base units. */
  tips: bigint
}

/** Verifies each payment against the contract, then settles the valid ones (single or batch). */
export async function settleItems(items: StoredItem[]): Promise<SettleResult> {
  if (!getOnline()) throw new Error('You are offline. Payments stay safe on this device until you reconnect.')
  const me = getAccount().address
  const pending = items.filter((i) => i.status === 'pending')
  const ready: StoredItem[] = []
  for (const item of pending) {
    const code = Number(
      await publicClient.readContract({
        address: MESHPAY_ADDRESS,
        abi: MESHPAY_ABI,
        functionName: 'check',
        args: [toPayment(item), item.signature],
      }),
    )
    if (code === 0) ready.push(item)
    else if (code === 3) updateItem(item.id, { status: 'duplicate', note: 'Already settled on-chain' })
    else if (code === 2) updateItem(item.id, { status: 'expired', note: 'Past its deadline' })
    else if (code === 5) updateItem(item.id, { note: REJECT_LABELS[5] })
    else updateItem(item.id, { status: 'invalid', note: REJECT_LABELS[code] ?? 'Rejected' })
  }
  if (ready.length === 0) return { settled: 0, skipped: pending.length, tips: 0n }

  const ps = ready.map(toPayment)
  const sigs = ready.map((i) => i.signature)
  const w = wallet()
  const hash =
    ps.length === 1
      ? await w.writeContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'settle', args: [ps[0], sigs[0]] })
      : await w.writeContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'settleBatch', args: [ps, sigs] })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The settlement transaction reverted.')

  const logs = parseEventLogs({ abi: MESHPAY_ABI, logs: receipt.logs, eventName: ['Settled', 'Rejected'] })
  let settled = 0
  let tips = 0n
  for (const item of ready) {
    const from = item.from.toLowerCase()
    const nonce = BigInt(item.nonce)
    const ok = logs.find((l) => l.eventName === 'Settled' && l.args.from.toLowerCase() === from && l.args.nonce === nonce)
    const rejected = logs.find((l) => l.eventName === 'Rejected' && l.args.from.toLowerCase() === from && l.args.nonce === nonce)
    if (rejected && rejected.eventName === 'Rejected') {
      const code = Number(rejected.args.code)
      updateItem(item.id, {
        status: code === 3 ? 'duplicate' : code === 2 ? 'expired' : code === 5 ? 'pending' : 'invalid',
        note: REJECT_LABELS[code] ?? 'Rejected',
      })
    } else if (ok && ok.eventName === 'Settled') {
      settled += 1
      const earned = item.from.toLowerCase() !== me.toLowerCase() ? ok.args.fee : 0n
      tips += earned
      updateItem(item.id, { status: 'settled', txHash: hash, note: undefined, tip: earned > 0n ? earned.toString() : undefined })
    }
  }
  return { settled, skipped: pending.length - settled, hash, tips }
}

// ---- hooks ----

export interface Balances {
  wallet: bigint | null
  reserve: bigint | null
  /** Reserve minus signed-but-unsettled payments. */
  spendable: bigint | null
  committed: bigint
  live: boolean
  loading: boolean
  error: string | null
  refresh: () => void
}

/** Polls the wallet's USDC balance and MeshPay reserve while online; falls back to the last cached values offline. */
export function useBalances(address: Address | null): Balances {
  const online = useOnline()
  const { items, cache } = useData()
  const [wallet, setWallet] = useState<bigint | null>(null)
  const [reserve, setReserve] = useState<bigint | null>(null)
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    if (!address || !getOnline()) return
    setLoading(true)
    try {
      const [w, r] = await Promise.all([readWalletUsdc(address), readReserve(address)])
      if (!alive.current) return
      setWallet(w)
      setReserve(r)
      setLive(true)
      setError(null)
      setCache({ balance: w.toString(), reserve: r.toString() })
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not reach Arc.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [address])

  useEffect(() => {
    alive.current = true
    if (online) {
      void refresh()
      const t = setInterval(() => void refresh(), 10_000)
      return () => {
        alive.current = false
        clearInterval(t)
      }
    }
    setLive(false)
    return () => {
      alive.current = false
    }
  }, [online, refresh])

  const w = live && wallet !== null ? wallet : cache.balance ? BigInt(cache.balance) : null
  const r = live && reserve !== null ? reserve : cache.reserve ? BigInt(cache.reserve) : null
  const committed = items
    .filter((i) => i.source === 'signed' && i.status === 'pending')
    .reduce((s, i) => s + BigInt(i.amount) + BigInt(i.fee || '0'), 0n)
  const spendable = r === null ? null : r > committed ? r - committed : 0n
  return { wallet: w, reserve: r, spendable, committed, live, loading, error, refresh: () => void refresh() }
}
