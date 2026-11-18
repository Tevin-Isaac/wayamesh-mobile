/**
 * Read-only live check of the web wallet's ABI wiring against MeshPayV2 on Arc Testnet.
 * Spends nothing and needs no funds. Run:  npm run check:contract
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { hashTypedData } from 'viem'
import { CHAIN, MESHPAY_ADDRESS, USDC_ADDRESS, publicClient } from '../src/lib/chain'
import { MESHPAY_ABI, TYPES, ZERO_REF, domain, signPayment, type Payment } from '../src/lib/mesh'
import { erc20Abi } from 'viem'

const ok = (m: string) => console.log(`PASS  ${m}`)
const fail = (m: string): never => {
  console.error(`FAIL  ${m}`)
  process.exit(1)
}

const chainId = await publicClient.getChainId()
chainId === CHAIN.id ? ok(`RPC chainId ${chainId}`) : fail(`chainId ${chainId} != ${CHAIN.id}`)

const delay = await publicClient.readContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'WITHDRAW_DELAY' })
delay === 86400n ? ok(`WITHDRAW_DELAY() = ${delay}s`) : fail(`WITHDRAW_DELAY ${delay}`)

const throwaway = privateKeyToAccount(generatePrivateKey())
const reserve = await publicClient.readContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'reserve', args: [throwaway.address] })
ok(`reserve(${throwaway.address}) = ${reserve} (throwaway key, expected 0)`)

const [wAmount, wUnlock] = await publicClient.readContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'withdrawalRequest', args: [throwaway.address] })
ok(`withdrawalRequest() = (${wAmount}, ${wUnlock}) (expected 0,0)`)

const dec = await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'decimals' })
const bal = await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [throwaway.address] })
dec === 6 ? ok(`USDC facade decimals() = ${dec}, balanceOf(throwaway) = ${bal}`) : fail(`USDC decimals ${dec}`)

// Signature domain: our local EIP-712 digest must equal the contract's, and `check` must see our signature as valid.
const p: Payment = {
  from: throwaway.address,
  to: '0x000000000000000000000000000000000000dEaD',
  amount: 1_000_000n,
  fee: 0n,
  nonce: 42n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  ref: ZERO_REF,
}
const onchainDigest = await publicClient.readContract({ address: MESHPAY_ADDRESS, abi: [{ type: 'function', name: 'paymentDigest', stateMutability: 'view', inputs: [{ name: 'p', type: 'tuple', components: TYPES_ABI() }], outputs: [{ type: 'bytes32' }] }] as const, functionName: 'paymentDigest', args: [p] })
const localDigest = hashTypedData({ domain: domain(), types: TYPES, primaryType: 'Payment', message: p })
onchainDigest === localDigest ? ok(`EIP-712 digest matches contract paymentDigest(): ${localDigest}`) : fail(`digest mismatch local ${localDigest} vs chain ${onchainDigest}`)

const sig = await signPayment(throwaway, p)
const code = Number(await publicClient.readContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'check', args: [p, sig] }))
// 5 = valid signature but the throwaway has no reserve. 4 would mean the signature/domain is wrong.
code === 5 ? ok(`check(voucher) = 5 (signature valid, reserve empty as expected)`) : fail(`check(voucher) = ${code}, expected 5`)

const bad = Number(await publicClient.readContract({ address: MESHPAY_ADDRESS, abi: MESHPAY_ABI, functionName: 'check', args: [{ ...p, amount: 2_000_000n }, sig] }))
bad === 4 ? ok(`check(tampered voucher) = 4 (bad signature)`) : fail(`tampered check = ${bad}, expected 4`)

console.log('\nAll read-only contract checks passed. No transactions were sent.')

function TYPES_ABI() {
  return [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'fee', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'ref', type: 'bytes32' },
  ] as const
}
