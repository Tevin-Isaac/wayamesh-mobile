import { MESHPAY_ADDRESS, USDC_ERC20 } from '../mesh/voucher';

// Input-safety helpers shared by send, chat-pay, add-contact and chat display (pure: no React Native imports, so they
// are covered by tests/security.test.ts). Ported from the Arc Studio web wallet's guard.ts / format.ts.

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Storage caps: nobody can fill the phone by flooding it with strangers' data. */
export const CAPS = {
  unsettledPayments: 150,
  storedPayments: 400,
  messages: 2500,
  contacts: 300,
  messageRequests: 40,
  /** Ids remembered to drop relay duplicates. */
  seenIds: 5000,
} as const;

/** Sending to these addresses would lose the money. Returns the reason, or null when the address is fine. */
export function unsafeRecipient(to: string): string | null {
  const t = to.toLowerCase();
  if (t === ZERO_ADDRESS) return 'That is the empty address. Money sent there is lost.';
  if (t === USDC_ERC20.toLowerCase()) return 'That is the USDC token contract. Money sent there is lost.';
  if (t === MESHPAY_ADDRESS.toLowerCase()) return 'That is the settlement contract. Pay a person, not the contract.';
  return null;
}

/** A decimal amount from a stranger, or '' when it is not a plain number. Never throws. */
export function safeDecimal(input: unknown): string {
  return typeof input === 'string' && /^\d{1,12}(\.\d{1,6})?$/.test(input) ? input : '';
}

/** A stranger's decimal amount shown with two decimals, or '' if it is not a valid number. */
export function fmtDecimal(input: unknown): string {
  const d = safeDecimal(input);
  if (!d) return '';
  const [whole, frac = ''] = d.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${(frac + '00').slice(0, 2)}`;
}

/**
 * Address-poisoning guard: attackers send dust from an address that starts and ends like one you know, hoping you copy it
 * later. Returns the real address when `to` only LOOKS like a known one (same first 6 and last 4 characters).
 */
export function lookalike(to: string, known: string[]): string | null {
  const t = to.toLowerCase();
  if (known.some((k) => k.toLowerCase() === t)) return null;
  for (const k of known) {
    const a = k.toLowerCase();
    if (a.slice(0, 6) === t.slice(0, 6) && a.slice(-4) === t.slice(-4)) return k;
  }
  return null;
}

/** Groups an address into blocks of four so every character can be checked by eye. */
export function groupAddress(address: string): string {
  return address.slice(2).replace(/(.{4})/g, '$1 ').trim();
}
