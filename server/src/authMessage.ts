// Shared, dependency-free. Copy verbatim into the app / web client.

export const AUTH_WINDOW_MS = 5 * 60 * 1000;
export type RampAction = 'onramp' | 'offramp';

/** Normalise Kenyan numbers (07xx, 01xx, +254..., 254...) to 254XXXXXXXXX, or null. */
export function normalizePhone(input: string): string | null {
  const s = String(input ?? '').replace(/[\s\-()]/g, '');
  let d: string;
  if (/^\+254\d{9}$/.test(s)) d = s.slice(1);
  else if (/^254\d{9}$/.test(s)) d = s;
  else if (/^0\d{9}$/.test(s)) d = '254' + s.slice(1);
  else if (/^[71]\d{8}$/.test(s)) d = '254' + s;
  else return null;
  return /^254[17]\d{8}$/.test(d) ? d : null;
}

/** `address` must already be EIP-55 checksummed, `phone` normalised. `amount` = amountKes (onramp) or usdc string (offramp). */
export function buildAuthMessage(p: {
  action: RampAction; address: string; phone: string; amount: string; issuedAt: number;
}): string {
  return `Wayamesh ramp\nAction: ${p.action}\nAddress: ${p.address}\nPhone: ${p.phone}\nAmount: ${p.amount}\nIssued: ${p.issuedAt}`;
}
