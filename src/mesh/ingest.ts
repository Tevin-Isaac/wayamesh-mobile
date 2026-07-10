import { getDb } from '@/db/schema';
import { saveTransaction, logMeshRelay } from '@/db/queries';
import { getContact, addMessage, hasPaymentMessage } from '@/db/chat';
import { decodeEnvelope, type DecodedEnvelope } from './envelope';

// Ingest a payment envelope received from another device (QR scan or BLE).
// The receiver becomes a holder of the settlement-ready transaction: it joins
// the local queue as 'relayed' and the existing settle loop broadcasts it the
// moment THIS device is online — the sender no longer needs to reconnect.

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
  transport: 'qr' | 'ble' = 'qr',
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

  saveTransaction({
    hash: env.hash,
    from_address: env.from,
    to_address: env.to,
    amount: env.amount,
    status: 'relayed',
    raw_signed: env.rawSigned,
  });
  logMeshRelay(env.hash, `${transport}-handoff`);

  // Drop an incoming payment bubble in chat when the payer is a known contact.
  if (role === 'recipient' && getContact(env.from) && !hasPaymentMessage(env.hash)) {
    addMessage({
      peer: env.from.toLowerCase(), direction: 'in', kind: 'payment',
      amount: env.amount, txHash: env.hash, status: 'relayed',
    });
  }

  return { status: 'accepted', role, envelope: env };
}
