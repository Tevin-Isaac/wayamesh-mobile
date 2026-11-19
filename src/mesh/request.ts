import { cleanText, isAddress, toChecksumAddress } from '../chat/crypto';

// Payment-request links, shared with the Arc Studio web wallet:
//   meshpay:<address>?amount=<decimal>&ref=<0x32 bytes>&note=<text>
// Everything in a link comes from a stranger, so each field is validated and cleaned.

const PREFIX = 'meshpay:';

export interface PaymentRequest {
  address: string;
  amount?: string;
  /** Invoice reference the payment must carry so the receiver can match it. */
  ref?: string;
  note?: string;
}

export function encodeRequest(r: PaymentRequest): string {
  const q: string[] = [];
  if (r.amount) q.push(`amount=${encodeURIComponent(r.amount)}`);
  if (r.ref) q.push(`ref=${encodeURIComponent(r.ref)}`);
  if (r.note) q.push(`note=${encodeURIComponent(r.note.slice(0, 80))}`);
  return `${PREFIX}${r.address}${q.length ? `?${q.join('&')}` : ''}`;
}

export function parseRequest(text: string): PaymentRequest | null {
  const raw = text.trim();
  if (!raw.startsWith(PREFIX)) return null;
  const [addr, query = ''] = raw.slice(PREFIX.length).split('?');
  if (!isAddress(addr)) return null;
  const get = (k: string): string | null => {
    for (const part of query.split('&')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i) === k) {
        try { return decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' ')); } catch { return null; }
      }
    }
    return null;
  };
  const amount = get('amount');
  const ref = get('ref');
  const note = get('note');
  return {
    address: toChecksumAddress(addr),
    amount: amount && /^\d{1,12}(\.\d{1,6})?$/.test(amount) ? amount : undefined,
    ref: ref && /^0x[0-9a-fA-F]{64}$/.test(ref) ? ref : undefined,
    note: note ? cleanText(note, 80) : undefined,
  };
}
