import {
  randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual,
} from 'node:crypto';
import { config } from './config.js';

// AES-256-GCM encryption of custodial private keys at rest.
//
// SCAFFOLD NOTE: the key is derived from a single server-held MASTER_SECRET. In
// production the master key must live in a KMS/HSM, or custody should move to an
// MPC provider so no single server breach exposes all user keys.

const KEY = scryptSync(config.masterSecret, 'wayamesh-ussd-kdf', 32);

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv.tag.ciphertext, all base64
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// PIN hashing — scrypt with per-user salt. Never store the PIN itself.
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `${salt.toString('base64')}.${hash.toString('base64')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split('.');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(pin, Buffer.from(saltB64, 'base64'), 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
