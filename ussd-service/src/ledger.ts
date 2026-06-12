import { db, getUser, type UserRow } from './db.js';
import { createCustodialWallet } from './wallet.js';
import { hashPin } from './crypto.js';

// All amounts are USDC base units (integers, 6dp) — never floats, to avoid
// rounding errors with money.

export function registerUser(phone: string, pin: string): UserRow {
  const { address, encryptedKey } = createCustodialWallet();
  db.prepare(
    'INSERT INTO users (phone, address, encrypted_key, pin_hash) VALUES (?, ?, ?, ?)',
  ).run(phone, address, encryptedKey, hashPin(pin));
  return getUser(phone)!;
}

export function getBalance(phone: string): number {
  return getUser(phone)?.balance ?? 0;
}

/**
 * Instant, gas-free internal transfer between two registered users.
 * Runs in a single SQL transaction so the debit and credit are atomic — a crash
 * mid-transfer can never create or destroy funds.
 */
export const transferInternal = db.transaction(
  (fromPhone: string, toPhone: string, amount: number): void => {
    if (amount <= 0) throw new Error('Amount must be positive');
    const sender = getUser(fromPhone);
    const recipient = getUser(toPhone);
    if (!sender) throw new Error('Sender not found');
    if (!recipient) throw new Error('Recipient is not a Wayamesh user');
    if (sender.phone === recipient.phone) throw new Error('Cannot send to yourself');
    if (sender.balance < amount) throw new Error('Insufficient balance');

    db.prepare('UPDATE users SET balance = balance - ? WHERE phone = ?').run(amount, fromPhone);
    db.prepare('UPDATE users SET balance = balance + ? WHERE phone = ?').run(amount, toPhone);
    db.prepare(
      'INSERT INTO ledger_tx (phone, type, amount, counterparty) VALUES (?, ?, ?, ?)',
    ).run(fromPhone, 'transfer_out', -amount, toPhone);
    db.prepare(
      'INSERT INTO ledger_tx (phone, type, amount, counterparty) VALUES (?, ?, ?, ?)',
    ).run(toPhone, 'transfer_in', amount, fromPhone);
  },
);

/** Credit a confirmed on-chain deposit into a user's ledger balance. */
export const creditDeposit = db.transaction(
  (phone: string, amount: number, onchainHash: string): void => {
    db.prepare('UPDATE users SET balance = balance + ? WHERE phone = ?').run(amount, phone);
    db.prepare(
      'INSERT INTO ledger_tx (phone, type, amount, onchain_hash) VALUES (?, ?, ?, ?)',
    ).run(phone, 'deposit', amount, onchainHash);
  },
);

/** Debit a user's ledger for an on-chain withdrawal (call after the tx confirms). */
export const debitWithdrawal = db.transaction(
  (phone: string, amount: number, toAddress: string, onchainHash: string): void => {
    const u = getUser(phone);
    if (!u || u.balance < amount) throw new Error('Insufficient balance');
    db.prepare('UPDATE users SET balance = balance - ? WHERE phone = ?').run(amount, phone);
    db.prepare(
      'INSERT INTO ledger_tx (phone, type, amount, counterparty, onchain_hash) VALUES (?, ?, ?, ?, ?)',
    ).run(phone, 'withdraw', -amount, toAddress, onchainHash);
  },
);

export interface PinCheck { ok: boolean; lockedSeconds: number; attemptsLeft: number }

export function checkAndRecordPin(
  phone: string,
  pin: string,
  verify: (pin: string, hash: string) => boolean,
  maxAttempts: number,
  windowSeconds: number,
): PinCheck {
  const u = getUser(phone);
  if (!u) return { ok: false, lockedSeconds: 0, attemptsLeft: 0 };

  const now = Math.floor(Date.now() / 1000);
  if (u.locked_until > now) {
    return { ok: false, lockedSeconds: u.locked_until - now, attemptsLeft: 0 };
  }

  if (verify(pin, u.pin_hash)) {
    db.prepare('UPDATE users SET pin_attempts = 0, locked_until = 0 WHERE phone = ?').run(phone);
    return { ok: true, lockedSeconds: 0, attemptsLeft: maxAttempts };
  }

  const attempts = u.pin_attempts + 1;
  let lockedUntil = 0;
  if (attempts >= maxAttempts) lockedUntil = now + windowSeconds;
  db.prepare('UPDATE users SET pin_attempts = ?, locked_until = ? WHERE phone = ?')
    .run(attempts, lockedUntil, phone);
  return {
    ok: false,
    lockedSeconds: lockedUntil ? windowSeconds : 0,
    attemptsLeft: Math.max(0, maxAttempts - attempts),
  };
}
