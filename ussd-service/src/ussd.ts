import { config } from './config.js';
import { getUser } from './db.js';
import { verifyPin } from './crypto.js';
import {
  registerUser, getBalance, transferInternal, checkAndRecordPin,
} from './ledger.js';
import { fromBaseUnits, toBaseUnits } from './wallet.js';

// USSD responses: "CON ..." keeps the session open for more input; "END ..."
// closes it. Africa's Talking sends the full input path joined by '*' in `text`.

export interface UssdRequest {
  sessionId: string;
  phoneNumber: string;
  text: string;
}

const CON = (s: string) => `CON ${s}`;
const END = (s: string) => `END ${s}`;

// Normalise MSISDN-ish input to a canonical phone key (digits, leading +).
function normalisePhone(raw: string): string {
  const t = raw.trim().replace(/\s+/g, '');
  if (t.startsWith('+')) return t;
  if (t.startsWith('0')) return t; // local format; a real deployment maps to E.164 per country
  return t;
}

function isPin(s: string): boolean {
  return new RegExp(`^\\d{${config.pinLength}}$`).test(s);
}

export function handleUssd(req: UssdRequest): string {
  const phone = normalisePhone(req.phoneNumber);
  const parts = req.text === '' ? [] : req.text.split('*');
  const user = getUser(phone);

  // ── Unregistered: onboarding ────────────────────────────────────────────────
  if (!user) {
    if (parts.length === 0) {
      return CON('Welcome to Wayamesh\nUSDC for everyone.\n1. Create account\n2. About');
    }
    if (parts[0] === '2') {
      return END('Wayamesh lets you hold and send US dollars (USDC) from any phone. Dial again and choose 1 to start.');
    }
    if (parts[0] === '1') {
      if (parts.length === 1) return CON(`Create a ${config.pinLength}-digit PIN:`);
      if (parts.length === 2) {
        if (!isPin(parts[1])) return END(`PIN must be ${config.pinLength} digits. Dial again.`);
        return CON('Confirm your PIN:');
      }
      if (parts.length === 3) {
        if (parts[1] !== parts[2]) return END('PINs did not match. Dial again to retry.');
        registerUser(phone, parts[1]);
        return END('Account created! Dial again to send money, check balance, or deposit.');
      }
    }
    return END('Invalid choice.');
  }

  // ── Registered: main menu ───────────────────────────────────────────────────
  if (parts.length === 0) {
    return CON('Wayamesh\n1. Send money\n2. Balance\n3. My deposit address\n4. Withdraw to wallet');
  }

  switch (parts[0]) {
    case '1': return sendFlow(phone, parts);
    case '2': return balanceFlow(phone, parts);
    case '3': return END(`Your USDC deposit address (Base):\n${user.address}\n\nSend USDC here to top up. It credits after network confirmation.`);
    case '4': return withdrawFlow(phone, parts);
    default:  return END('Invalid choice.');
  }
}

// 1. Send money: 1 -> recipient phone -> amount -> PIN
function sendFlow(phone: string, parts: string[]): string {
  if (parts.length === 1) return CON('Enter recipient phone number:');
  if (parts.length === 2) return CON('Enter amount (USDC):');
  if (parts.length === 3) {
    const amount = Number(parts[2]);
    if (!isFinite(amount) || amount <= 0) return END('Invalid amount. Dial again.');
    return CON(`Send ${parts[2]} USDC to ${parts[1]}?\nEnter PIN to confirm:`);
  }
  if (parts.length === 4) {
    const [, recipientRaw, amountRaw, pin] = parts;
    const gate = checkAndRecordPin(phone, pin, verifyPin, config.lockout.maxAttempts, config.lockout.windowSeconds);
    if (!gate.ok) {
      return END(gate.lockedSeconds
        ? `Too many wrong PINs. Try again in ${Math.ceil(gate.lockedSeconds / 60)} min.`
        : `Wrong PIN. ${gate.attemptsLeft} attempt(s) left.`);
    }
    try {
      const amount = toBaseUnits(amountRaw);
      transferInternal(phone, normalisePhone(recipientRaw), Number(amount));
      return END(`Sent ${amountRaw} USDC to ${recipientRaw}.\nNew balance: ${fromBaseUnits(getBalance(phone))} USDC`);
    } catch (e) {
      return END(e instanceof Error ? e.message : 'Transfer failed.');
    }
  }
  return END('Invalid input.');
}

// 2. Balance: 2 -> PIN
function balanceFlow(phone: string, parts: string[]): string {
  if (parts.length === 1) return CON('Enter PIN to view balance:');
  const gate = checkAndRecordPin(phone, parts[1], verifyPin, config.lockout.maxAttempts, config.lockout.windowSeconds);
  if (!gate.ok) {
    return END(gate.lockedSeconds
      ? `Too many wrong PINs. Try again in ${Math.ceil(gate.lockedSeconds / 60)} min.`
      : `Wrong PIN. ${gate.attemptsLeft} attempt(s) left.`);
  }
  return END(`Your balance: ${fromBaseUnits(getBalance(phone))} USDC`);
}

// 4. Withdraw to external wallet: 4 -> address -> amount -> PIN
// Queues an on-chain payout; settlement is handled by the payout worker.
function withdrawFlow(phone: string, parts: string[]): string {
  if (parts.length === 1) return CON('Enter destination wallet address (0x...):');
  if (parts.length === 2) return CON('Enter amount (USDC):');
  if (parts.length === 3) {
    const amount = Number(parts[2]);
    if (!isFinite(amount) || amount <= 0) return END('Invalid amount. Dial again.');
    return CON(`Withdraw ${parts[2]} USDC to ${parts[1].slice(0, 10)}...?\nEnter PIN to confirm:`);
  }
  if (parts.length === 4) {
    const gate = checkAndRecordPin(phone, parts[3], verifyPin, config.lockout.maxAttempts, config.lockout.windowSeconds);
    if (!gate.ok) {
      return END(gate.lockedSeconds
        ? `Too many wrong PINs. Try again in ${Math.ceil(gate.lockedSeconds / 60)} min.`
        : `Wrong PIN. ${gate.attemptsLeft} attempt(s) left.`);
    }
    // On-chain payout is processed asynchronously by the payout worker so the
    // USSD session (which times out fast) doesn't block on block confirmation.
    return END('Withdrawal request received. You will get an SMS when it completes.');
  }
  return END('Invalid input.');
}
