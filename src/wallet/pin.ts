import { ethers } from 'ethers';
import { getDb } from '@/db/schema';
import { readPrivateKey } from './keystore';

// [attempts_reached, lock_duration_seconds]
const LOCKOUT_SCHEDULE: [number, number][] = [
  [3,  30],
  [5,  300],
  [8,  1800],
  [10, 3600],
];

function lockSecondsForCount(count: number): number {
  let out = 0;
  for (const [threshold, secs] of LOCKOUT_SCHEDULE) {
    if (count >= threshold) out = secs;
  }
  return out;
}

export interface PinStatus {
  allowed: boolean;
  attemptsLeft: number | null;
  lockedUntil: number | null;
  lockSeconds: number;
}

function initRow(): void {
  getDb().runSync(
    'INSERT OR IGNORE INTO pin_security (id, attempt_count, locked_until) VALUES (1, 0, 0)',
  );
}

export function getPinStatus(): PinStatus {
  initRow();
  const row = getDb().getFirstSync<{ attempt_count: number; locked_until: number }>(
    'SELECT attempt_count, locked_until FROM pin_security WHERE id = 1',
  );
  if (!row) return { allowed: true, attemptsLeft: null, lockedUntil: null, lockSeconds: 0 };

  const now    = Math.floor(Date.now() / 1000);
  const locked = row.locked_until > now;

  let attemptsLeft: number | null = null;
  for (const [threshold] of LOCKOUT_SCHEDULE) {
    if (row.attempt_count < threshold) {
      attemptsLeft = threshold - row.attempt_count;
      break;
    }
  }

  return {
    allowed:      !locked,
    attemptsLeft,
    lockedUntil:  locked ? row.locked_until : null,
    lockSeconds:  lockSecondsForCount(row.attempt_count),
  };
}

export function recordPinFailure(): PinStatus {
  initRow();
  const db = getDb();
  db.runSync('UPDATE pin_security SET attempt_count = attempt_count + 1 WHERE id = 1');
  const row = db.getFirstSync<{ attempt_count: number }>(
    'SELECT attempt_count FROM pin_security WHERE id = 1',
  );
  const count      = row?.attempt_count ?? 1;
  const lockSecs   = lockSecondsForCount(count);
  if (lockSecs > 0) {
    const lockedUntil = Math.floor(Date.now() / 1000) + lockSecs;
    db.runSync('UPDATE pin_security SET locked_until = ? WHERE id = 1', [lockedUntil]);
  }
  return getPinStatus();
}

export function resetPinAttempts(): void {
  initRow();
  getDb().runSync(
    'UPDATE pin_security SET attempt_count = 0, locked_until = 0 WHERE id = 1',
  );
}

/**
 * Encrypt the wallet private key with a passphrase using ethers.js scrypt
 * keystore (EIP-55). scrypt N=131072 makes each guess cost ~seconds; combined
 * with an alphanumeric passphrase this resists offline brute force of a stolen
 * backup file (the in-app lockout only guards on-device attempts).
 */
export async function encryptWithPin(pin: string): Promise<string> {
  const pk = await readPrivateKey('Authenticate to encrypt your backup');
  if (!pk) throw new Error('No wallet key found');
  return new ethers.Wallet(pk).encrypt(pin);
}

/**
 * Decrypt a keystore JSON with a PIN.
 * Enforces lockout before attempting; records failure on wrong PIN.
 */
export async function decryptWithPin(
  keystoreJson: string,
  pin: string,
): Promise<ethers.Wallet | ethers.HDNodeWallet> {
  const status = getPinStatus();
  if (!status.allowed) {
    const secs = status.lockedUntil
      ? Math.max(0, status.lockedUntil - Math.floor(Date.now() / 1000))
      : status.lockSeconds;
    throw new Error(`Too many attempts. Try again in ${fmtSeconds(secs)}.`);
  }

  try {
    const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, pin);
    resetPinAttempts();
    return wallet;
  } catch {
    const next = recordPinFailure();
    if (!next.allowed && next.lockedUntil) {
      const secs = Math.max(0, next.lockedUntil - Math.floor(Date.now() / 1000));
      throw new Error(`Wrong PIN. Wallet locked for ${fmtSeconds(secs)}.`);
    }
    const left = next.attemptsLeft;
    throw new Error(
      left !== null
        ? `Wrong PIN. ${left} attempt${left !== 1 ? 's' : ''} before lockout.`
        : 'Wrong PIN.',
    );
  }
}

function fmtSeconds(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  return `${Math.ceil(s / 3600)}h`;
}
