import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { ethers } from 'ethers';
import { saveWallet, getWallet, type WalletRow } from '@/db/queries';
import { getPreferences, setBiometric } from '@/utils/preferences';

const KEY_STORE_KEY = 'wayamesh_encrypted_pk';
const MNEMONIC_KEY  = 'wayamesh_mnemonic';
const PRESENT_KEY   = 'wayamesh_wallet_present'; // non-auth existence marker

// BIP-44 path for Ethereum-compatible chains (Arc is EVM-compatible, coin type 60)
const DERIVATION_PATH = "m/44'/60'/0'/0/0";

// Base storage: device-only. The raw key is deliberately excluded from iCloud/
// device backups — the PIN/passphrase-encrypted file (backup.ts) is the only
// intended off-device recovery path, so a stolen backup never contains the key.
const BASE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Auth-bound storage: the OS keychain/keystore enforces biometric (or device
// credential) on every read of the key. This is hardware-level — it cannot be
// bypassed by tampering with the JS bundle, unlike a JavaScript-only check.
function authOpts(prompt: string): SecureStore.SecureStoreOptions {
  return { ...BASE_OPTS, requireAuthentication: true, authenticationPrompt: prompt };
}

// Whether the key is currently stored auth-bound. Mirrors what persist() wrote;
// kept in sync so reads use matching options on every platform.
function authEnabled(): boolean {
  try {
    return getPreferences().biometric_enabled;
  } catch {
    return true; // DB not ready — default to the safer (auth-required) path
  }
}

function readOpts(prompt: string): SecureStore.SecureStoreOptions {
  return authEnabled() ? authOpts(prompt) : BASE_OPTS;
}

// ── Secret persistence (centralised so storage options never drift) ───────────

/**
 * Write the private key (and optional mnemonic) under the access control implied
 * by the biometric preference. If auth-bound storage is requested but the device
 * has no biometric/credential enrolled, falls back to BASE_OPTS and turns the
 * preference off — so a user without biometrics is never locked out of funds.
 */
async function persistSecrets(privateKey: string, mnemonic: string | null): Promise<void> {
  const wantAuth = authEnabled();
  const opts = wantAuth ? authOpts('Secure your Wayamesh wallet') : BASE_OPTS;
  try {
    await SecureStore.setItemAsync(KEY_STORE_KEY, privateKey, opts);
    if (mnemonic) await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic, opts);
    else          await SecureStore.deleteItemAsync(MNEMONIC_KEY);
  } catch (e) {
    if (!wantAuth) throw e;
    // Device can't store auth-bound secrets (no enrolled biometric / lock screen).
    setBiometric(false);
    await SecureStore.setItemAsync(KEY_STORE_KEY, privateKey, BASE_OPTS);
    if (mnemonic) await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic, BASE_OPTS);
    else          await SecureStore.deleteItemAsync(MNEMONIC_KEY);
  }
  await SecureStore.setItemAsync(PRESENT_KEY, '1', BASE_OPTS);
}

/** Read the private key, prompting OS biometric if the key is auth-bound. */
export async function readPrivateKey(prompt: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_STORE_KEY, readOpts(prompt));
  } catch {
    return null; // user cancelled / failed OS auth
  }
}

/**
 * Switch the key between hardware-auth-bound and convenience storage.
 * Reading uses the CURRENT setting, so disabling requires passing biometric
 * first (you can't strip protection without authenticating). Returns false if
 * the device cannot honour the requested mode.
 */
export async function setKeyAuthBinding(enabled: boolean): Promise<boolean> {
  const pk = await SecureStore.getItemAsync(KEY_STORE_KEY, readOpts('Authenticate to change security settings'));
  if (!pk) return false;
  const mn = await SecureStore.getItemAsync(MNEMONIC_KEY, readOpts('Authenticate to change security settings'));
  const opts = enabled ? authOpts('Secure your Wayamesh wallet') : BASE_OPTS;
  try {
    await SecureStore.setItemAsync(KEY_STORE_KEY, pk, opts);
    if (mn) await SecureStore.setItemAsync(MNEMONIC_KEY, mn, opts);
    return true;
  } catch {
    return false;
  }
}

// ── Wallet creation ───────────────────────────────────────────────────────────

/**
 * Generate a new HD wallet.
 * Uses 256-bit entropy → 24-word mnemonic (stronger than the 128-bit / 12-word minimum).
 * Derives at the standard BIP-44 path for Ethereum-compatible chains.
 */
export async function createWallet(): Promise<{ address: string; publicKey: string }> {
  // Refuse to overwrite an existing key — prevents silently destroying a
  // funded wallet (and its only on-device copy) if create is ever re-triggered.
  const existing = await SecureStore.getItemAsync(KEY_STORE_KEY);
  if (existing) {
    throw new Error('A wallet already exists on this device. Sign out first to create a new one.');
  }

  const entropy  = ethers.randomBytes(32);
  const mnemonic = ethers.Mnemonic.entropyToPhrase(entropy);
  const hd       = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, DERIVATION_PATH);

  await persistSecrets(hd.privateKey, mnemonic);

  const pubKey  = hd.signingKey.publicKey;
  const address = ethers.getAddress(hd.address);

  saveWallet({ address, public_key: pubKey, encrypted_key: '[SecureStore]' });
  return { address, publicKey: pubKey };
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Import from a BIP-39 mnemonic or raw private key.
 * Mnemonic imports derive at BIP-44. Private-key imports are used as-is.
 */
export async function importWallet(
  input: string,
): Promise<{ address: string; publicKey: string }> {
  const trimmed   = input.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const isMnemonic = wordCount >= 12;

  let wallet: ethers.HDNodeWallet | ethers.Wallet;

  if (isMnemonic) {
    if (!ethers.Mnemonic.isValidMnemonic(trimmed)) {
      throw new Error('Invalid mnemonic phrase — please check your words and try again');
    }
    wallet = ethers.HDNodeWallet.fromPhrase(trimmed, undefined, DERIVATION_PATH);
  } else {
    // Accept both "0x…" and bare hex
    const normalized = /^[0-9a-fA-F]{64}$/.test(trimmed) ? `0x${trimmed}` : trimmed;
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new Error('Invalid private key — must be 64 hex characters');
    }
    wallet = new ethers.Wallet(normalized);
  }

  await persistSecrets(wallet.privateKey, isMnemonic ? trimmed : null);

  const pubKey  = wallet.signingKey.publicKey;
  const address = ethers.getAddress(wallet.address);

  saveWallet({ address, public_key: pubKey, encrypted_key: '[SecureStore]' });
  return { address, publicKey: pubKey };
}

/**
 * Import from an EIP-55 (UTC JSON) keystore file — compatible with MetaMask, Geth, etc.
 * The password is never stored anywhere.
 */
export async function importKeystoreJSON(
  json: string,
  password: string,
): Promise<{ address: string; publicKey: string }> {
  const w = await ethers.Wallet.fromEncryptedJson(json, password);
  return importWallet(w.privateKey);
}

// ── Key retrieval (OS-auth-gated when biometric binding is on) ────────────────

export async function loadWallet(): Promise<ethers.Wallet | null> {
  const pk = await readPrivateKey('Authenticate to access your wallet');
  return pk ? new ethers.Wallet(pk) : null;
}

export async function loadMnemonic(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(
      MNEMONIC_KEY,
      readOpts('Authenticate to reveal your seed phrase'),
    );
  } catch {
    return null;
  }
}

export async function exportPrivateKey(): Promise<string | null> {
  return readPrivateKey('Authenticate to export your private key');
}

/**
 * Export an EIP-55 encrypted keystore JSON.
 * Compatible with MetaMask, Geth, Trust Wallet, and most EVM wallets.
 */
export async function exportKeystoreJSON(password: string): Promise<string | null> {
  const pk = await readPrivateKey('Authenticate to export your keystore');
  if (!pk) return null;
  return new ethers.Wallet(pk).encrypt(password);
}

/**
 * EIP-191 personal sign. Required for dApp connections and proving wallet ownership.
 */
export async function signMessage(message: string | Uint8Array): Promise<string | null> {
  const pk = await readPrivateKey('Authenticate to sign this message');
  if (!pk) return null;
  return new ethers.Wallet(pk).signMessage(message);
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Existence check that NEVER triggers a biometric prompt — it reads a plain
 * marker, not the auth-bound key. Used on every launch / balance refresh.
 */
export async function hasWallet(): Promise<boolean> {
  const row: WalletRow | null = getWallet();
  if (!row) return false;
  const marker = await SecureStore.getItemAsync(PRESENT_KEY, BASE_OPTS);
  if (marker === '1') return true;
  // Migration for wallets created before the marker existed: keys back then were
  // stored without auth, so this read won't prompt. Backfill the marker.
  try {
    const legacy = await SecureStore.getItemAsync(KEY_STORE_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(PRESENT_KEY, '1', BASE_OPTS);
      return true;
    }
  } catch {
    // Key is already auth-bound but marker missing — treat as present.
    return true;
  }
  return false;
}

export async function deleteWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORE_KEY);
  await SecureStore.deleteItemAsync(MNEMONIC_KEY);
  await SecureStore.deleteItemAsync(PRESENT_KEY);
}

export async function biometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled   = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
}
