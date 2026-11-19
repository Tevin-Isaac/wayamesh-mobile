import { Wallet, JsonRpcProvider, parseUnits, getAddress, randomBytes, hexlify, Interface } from 'ethers';

export interface Treasury {
  address: string | null;
  mock: boolean;
  sendUsdc(to: string, usdc: string): Promise<{ txHash: string; mock: boolean }>;
}
export interface DepositTx { from: string; to: string | null; value: bigint }
export interface DepositChain {
  getTransaction(h: string): Promise<DepositTx | null>;
  getReceipt(h: string): Promise<{ status: number | null; blockNumber: number } | null>;
  /** Wait briefly for the tx to be mined. */
  waitReceipt(h: string): Promise<{ status: number | null; blockNumber: number } | null>;
  /** Logs of a mined transaction (used to verify MeshPay settlements). */
  getLogs?(h: string): Promise<{ address: string; topics: readonly string[]; data: string }[]>;
}

/** Arc USDC is the native token, 18 dp, at the RPC. Plain native transfer. */
export const toWei = (usdc: string) => parseUnits(usdc, 18);

export class ArcTreasury implements Treasury {
  private wallet: Wallet | null;
  readonly mock: boolean;
  constructor(rpcUrl: string, key: string, chainId = 5042002, name = 'arc-testnet') {
    this.wallet = key ? new Wallet(key, new JsonRpcProvider(rpcUrl, { chainId, name }, { staticNetwork: true })) : null;
    this.mock = !this.wallet;
  }
  get address() { return this.wallet?.address ?? null; }
  async sendUsdc(to: string, usdc: string) {
    if (!this.wallet) return { txHash: hexlify(randomBytes(32)), mock: true };
    const tx = await this.wallet.sendTransaction({ to: getAddress(to), value: toWei(usdc) });
    const r = await tx.wait(1);
    if (!r || r.status !== 1) throw new Error('treasury transfer reverted');
    return { txHash: tx.hash, mock: false };
  }
}

export function arcChain(rpcUrl: string, chainId = 5042002, name = 'arc-testnet'): DepositChain {
  const p = new JsonRpcProvider(rpcUrl, { chainId, name }, { staticNetwork: true });
  const map = (r: any) => (r ? { status: r.status as number | null, blockNumber: r.blockNumber as number } : null);
  return {
    async getTransaction(h) { const t = await p.getTransaction(h); return t ? { from: t.from, to: t.to, value: t.value } : null; },
    async getReceipt(h) { return map(await p.getTransactionReceipt(h)); },
    async waitReceipt(h) { return map(await p.waitForTransaction(h, 1, 20_000)); },
    async getLogs(h) { const r = await p.getTransactionReceipt(h); return r ? r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })) : []; },
  };
}

export type DepositCheck = { ok: true } | { ok: false; reason: string };

/** Verify an off-ramp deposit: to==treasury, value, from==user, success, mined. (Replay check is done by the store.) */
export async function verifyDeposit(
  chain: DepositChain,
  a: { txHash: string; from: string; treasury: string; usdc: string },
): Promise<DepositCheck> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(a.txHash)) return { ok: false, reason: 'invalid tx hash' };
  let tx = await chain.getTransaction(a.txHash);
  if (!tx) return { ok: false, reason: 'transaction not found' };
  let rc = await chain.getReceipt(a.txHash);
  if (!rc) rc = await chain.waitReceipt(a.txHash);
  if (!rc) return { ok: false, reason: 'transaction not confirmed yet' };
  if (rc.status !== 1) return { ok: false, reason: 'transaction failed on-chain' };
  if (!tx.to || getAddress(tx.to) !== getAddress(a.treasury)) return { ok: false, reason: 'transaction not sent to treasury' };
  if (getAddress(tx.from) !== getAddress(a.from)) return { ok: false, reason: 'transaction not sent from your address' };
  if (tx.value !== toWei(a.usdc)) return { ok: false, reason: 'transaction amount mismatch' };
  return { ok: true };
}

const MESHPAY_IFACE = new Interface([
  'event Settled(address indexed from, address indexed to, bytes32 indexed ref, uint256 nonce, uint256 amount, uint256 fee, address relayer)',
]);

/**
 * Verify an off-ramp deposit that was paid from the user's MeshPay reserve: the settlement
 * transaction must contain a Settled event from the MeshPay contract with from == user,
 * to == treasury and amount == the requested USDC (6 dp). The caller marks the tx hash used.
 */
export async function verifyVoucherDeposit(
  chain: DepositChain,
  a: { txHash: string; from: string; treasury: string; usdc: string; meshpay: string },
): Promise<DepositCheck> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(a.txHash)) return { ok: false, reason: 'invalid tx hash' };
  if (!a.meshpay || !chain.getLogs) return { ok: false, reason: 'reserve deposits are not enabled' };
  let rc = await chain.getReceipt(a.txHash);
  if (!rc) rc = await chain.waitReceipt(a.txHash);
  if (!rc) return { ok: false, reason: 'transaction not confirmed yet' };
  if (rc.status !== 1) return { ok: false, reason: 'transaction failed on-chain' };
  const want = parseUnits(a.usdc, 6);
  const topic = MESHPAY_IFACE.getEvent('Settled')!.topicHash;
  for (const log of await chain.getLogs(a.txHash)) {
    if (getAddress(log.address) !== getAddress(a.meshpay) || log.topics[0] !== topic) continue;
    const ev = MESHPAY_IFACE.parseLog({ topics: [...log.topics], data: log.data });
    if (!ev) continue;
    if (getAddress(ev.args.from) === getAddress(a.from) && getAddress(ev.args.to) === getAddress(a.treasury) && ev.args.amount === want) return { ok: true };
  }
  return { ok: false, reason: 'no matching payment from your reserve to the treasury in that transaction' };
}
