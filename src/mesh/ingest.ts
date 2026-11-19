import { getDb } from '@/db/schema';
import { saveTransaction, logMeshRelay } from '@/db/queries';
import { getContact, addMessage, hasPaymentMessage, getInvoice, markInvoiceReceived } from '@/db/chat';
import { getAcceptLimit } from '@/db/appSettings';
import { CAPS } from '@/utils/safety';
import { decodeEnvelope, type DecodedEnvelope } from './envelope';

// Ingest a payment envelope received from another device (QR scan or BLE).
// The receiver becomes a holder of the settlement-ready transaction: it joins
// the local queue as 'relayed' and the existing settle loop broadcasts it the
// moment THIS device is online — the sender no longer needs to reconnect.

/**
 * Receiver risk limit: the most unsettled offline value we'll hold from one
 * payer. Until a voucher settles it's a promise (the payer could double-spend
 * across receivers), so exposure to any one payer is capped.
 */
export { DEFAULT_ACCEPT_LIMIT as MAX_UNSETTLED_PER_PAYER_USDC } from '@/db/appSettings';

/**
 * Storage caps so a stranger cannot fill the phone: at most 150 unsettled payments, at most 400 stored payments from others.
 * Old settled/failed payments from others are pruned to make room; unsettled ones are never dropped.
 */
function assertRoom(myAddress: string | null): void {
  const db = getDb();
  const unsettled = db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE status IN ('pending','relayed')")?.n ?? 0;
  if (unsettled >= CAPS.unsettledPayments) {
    throw new Error(`Too many payments are waiting to settle (${CAPS.unsettledPayments}). Settle some first.`);
  }
  const me = (myAddress ?? '').toLowerCase();
  const others = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE lower(from_address) != ?', [me])?.n ?? 0;
  if (others >= CAPS.storedPayments) {
    const drop = others - CAPS.storedPayments + 1;
    const old = db.getAllSync<{ hash: string }>(
      "SELECT hash FROM transactions WHERE lower(from_address) != ? AND status IN ('settled','failed') ORDER BY created_at ASC LIMIT ?", [me, drop],
    );
    if (old.length < drop) throw new Error(`Too many stored payments (${CAPS.storedPayments}). Settle some first.`);
    for (const r of old) {
      db.runSync('DELETE FROM mesh_relays WHERE tx_hash = ?', [r.hash]);
      db.runSync('DELETE FROM transactions WHERE hash = ?', [r.hash]);
    }
  }
}

export type IngestRole = 'recipient' | 'courier';

export interface IngestResult {
  status: 'accepted' | 'duplicate';
  role: IngestRole;
  envelope: DecodedEnvelope;
}

/**
 * Validate and store an envelope. Throws (from decodeEnvelope) on anything
 * invalid. Idempotent: re-scanning the same payment is a no-op.
 */
export function ingestEnvelope(
  payload: string,
  myAddress: string | null,
  transport: 'qr' | 'ble' | 'chat' = 'qr',
): IngestResult {
  const env = decodeEnvelope(payload);
  const role: IngestRole =
    !!myAddress && env.to.toLowerCase() === myAddress.toLowerCase() ? 'recipient' : 'courier';

  const existing = getDb().getFirstSync<{ hash: string }>(
    'SELECT hash FROM transactions WHERE hash = ?', [env.hash],
  );
  if (existing) {
    return { status: 'duplicate', role, envelope: env };
  }

  if (env.kind === 'voucher' && role === 'recipient') {
    const row = getDb().getFirstSync<{ total: number | null }>(
      "SELECT SUM(CAST(amount AS REAL)) AS total FROM transactions WHERE kind = 'voucher' AND lower(from_address) = ? AND lower(to_address) = ? AND status IN ('pending','relayed')",
      [env.from.toLowerCase(), env.to.toLowerCase()],
    );
    const held = row?.total ?? 0;
    const limit = getAcceptLimit();
    if (held + Number(env.amount) > limit) {
      throw new Error(
        `Risk limit: you already hold $${held.toFixed(2)} unsettled from this payer. ` +
        `Settle those first (your accept limit is $${limit} offline per payer; change it in Settings).`,
      );
    }
  }
  assertRoom(myAddress);

  saveTransaction({
    hash: env.hash,
    from_address: env.from,
    to_address: env.to,
    amount: env.amount,
    status: 'relayed',
    raw_signed: env.rawSigned,
    kind: env.kind ?? 'transfer',
  });
  logMeshRelay(env.hash, `${transport}-handoff`);

  // An invoice counts as paid only by a payment TO ME that covers its amount.
  if (role === 'recipient' && env.kind === 'voucher' && env.ref && !/^0x0+$/.test(env.ref)) {
    const inv = getInvoice(env.ref);
    if (inv && inv.status === 'open' && Number(env.amount) >= Number(inv.amount)) markInvoiceReceived(env.ref, env.hash);
  }

  // Drop an incoming payment bubble in chat when the payer is a known contact.
  if (role === 'recipient' && getContact(env.from) && !hasPaymentMessage(env.hash)) {
    addMessage({
      peer: env.from.toLowerCase(), direction: 'in', kind: 'payment',
      amount: env.amount, txHash: env.hash, status: 'relayed', verified: true,
    });
  }

  return { status: 'accepted', role, envelope: env };
}
