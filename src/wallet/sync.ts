import { ethers } from 'ethers';
import { getDb } from '@/db/schema';
import { ACTIVE_CHAIN } from '@/constants/chain';
import { withRpc } from './rpc';
import { getContact, addMessage, hasPaymentMessage } from '@/db/chat';

// ── Incoming-payment detection ────────────────────────────────────────────────
// Verified live against Arc testnet (see commit message):
//   • USDC exists as an ERC-20 facade at 0x3600…0000 with decimals()=6 that
//     MIRRORS the native balance. transfer() calls (faucet, MetaMask-style
//     wallets) emit standard Transfer logs → caught via eth_getLogs.
//   • Plain NATIVE value transfers emit NO logs at all → caught via a
//     balance-delta fallback (recorded without sender attribution).
// Both detectors feed the transactions table; log-based ones with a known
// sender also post a payment bubble into that contact's chat thread.

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const FACADE_DECIMALS = 6;     // ERC-20 facade side
const NATIVE_DECIMALS = 18;    // eth_getBalance side
const FIRST_RUN_LOOKBACK = 5_000;   // ~40 min of Arc blocks on first sync
const MAX_BLOCKS_PER_SYNC = 45_000; // bound RPC work per tick
const CHUNK = 9_000;                // getLogs range per request
const DUST_WEI = 1_000_000_000_000n; // 0.000001 USDC in 18dp

function kvGet(key: string): string | null {
  getDb().execSync('CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = getDb().getFirstSync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]);
  return row?.value ?? null;
}
function kvSet(key: string, value: string): void {
  getDb().execSync('CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  getDb().runSync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value]);
}

/** Insert an incoming tx if we haven't recorded it already (never overwrites). */
function insertIncoming(row: {
  hash: string; from: string; to: string; amount: string; blockTs?: number;
}): boolean {
  const res = getDb().runSync(
    `INSERT OR IGNORE INTO transactions (hash, from_address, to_address, amount, status, raw_signed, settled_at, created_at)
     VALUES (?, ?, ?, ?, 'settled', '', ?, ?)`,
    [
      row.hash, row.from, row.to, row.amount,
      row.blockTs ?? Math.floor(Date.now() / 1000),
      row.blockTs ?? Math.floor(Date.now() / 1000),
    ],
  );
  return res.changes > 0;
}

export interface SyncResult { newIncoming: number; scannedTo: number }

/**
 * Scan for USDC received by `address` since the last sync. Safe to call on a
 * timer: bounded work, idempotent inserts, silently no-ops offline.
 */
export async function syncIncoming(address: string): Promise<SyncResult> {
  const me = address.toLowerCase();
  const usdc = ACTIVE_CHAIN.usdc;
  // Facade address: on Arc the native USDC is mirrored at the well-known facade.
  const facade = usdc.type === 'erc20' ? usdc.contract : '0x3600000000000000000000000000000000000000';

  let newIncoming = 0;

  const latest = await withRpc((p) => p.getBlockNumber());

  // ── 1) Log-based detection (ERC-20 facade transfers, 6dp values) ────────────
  const lastKey = `last_scanned_${me}`;
  let from = Number(kvGet(lastKey) ?? 0) + 1;
  if (from <= 1) from = Math.max(1, latest - FIRST_RUN_LOOKBACK);
  if (latest - from > MAX_BLOCKS_PER_SYNC) from = latest - MAX_BLOCKS_PER_SYNC;

  const toTopic = ethers.zeroPadValue(me, 32);
  for (let start = from; start <= latest; start += CHUNK + 1) {
    const end = Math.min(start + CHUNK, latest);
    const logs = await withRpc((p) =>
      p.getLogs({
        address: facade,
        topics: [TRANSFER_TOPIC, null, toTopic],
        fromBlock: start,
        toBlock: end,
      }),
    );
    for (const log of logs) {
      const sender = ethers.getAddress('0x' + log.topics[1].slice(26));
      if (sender.toLowerCase() === me) continue; // self-transfer noise
      const value = BigInt(log.data === '0x' ? 0 : log.data);
      if (value === 0n) continue;
      const amount = ethers.formatUnits(value, FACADE_DECIMALS);
      const inserted = insertIncoming({ hash: log.transactionHash, from: sender, to: me, amount });
      if (inserted) {
        newIncoming++;
        // If the sender is a saved contact, drop a payment bubble in their thread.
        if (getContact(sender) && !hasPaymentMessage(log.transactionHash)) {
          addMessage({
            peer: sender, direction: 'in', kind: 'payment',
            amount, txHash: log.transactionHash, status: 'settled',
          });
        }
      }
    }
  }
  kvSet(lastKey, String(latest));

  // ── 2) Balance-delta fallback (native sends emit no logs) ───────────────────
  const balKey = `last_balance_${me}`;
  const current: bigint = await withRpc((p) => p.getBalance(me));
  const prevRaw = kvGet(balKey);
  if (prevRaw !== null) {
    const prev = BigInt(prevRaw);
    // Subtract what the logs already explained this round (scale 6dp → 18dp).
    // Anything still unexplained and positive is a native incoming transfer.
    const unexplained = current - prev;
    if (unexplained > DUST_WEI && newIncoming === 0) {
      const amount = Number(ethers.formatUnits(unexplained, NATIVE_DECIMALS)).toFixed(6);
      const inserted = insertIncoming({
        hash: `native-in-${latest}-${current.toString(16)}`,
        from: 'native transfer',
        to: me,
        amount,
      });
      if (inserted) newIncoming++;
    }
  }
  kvSet(balKey, current.toString());

  return { newIncoming, scannedTo: latest };
}
