import { getAddress, verifyMessage } from 'ethers';
import { AUTH_WINDOW_MS, buildAuthMessage, type RampAction } from './authMessage.js';

export class AuthError extends Error {}

export function verifyAuth(
  p: { action: RampAction; address: string; phone: string; amount: string; issuedAt: number; signature: string },
  now = Date.now(),
): string {
  let address: string;
  try { address = getAddress(p.address); } catch { throw new AuthError('invalid address'); }
  if (!Number.isFinite(p.issuedAt) || Math.abs(now - p.issuedAt) > AUTH_WINDOW_MS) throw new AuthError('signature expired');
  const msg = buildAuthMessage({ ...p, address });
  let signer: string;
  try { signer = verifyMessage(msg, p.signature); } catch { throw new AuthError('bad signature'); }
  if (signer !== address) throw new AuthError('signer does not match address');
  return address;
}
