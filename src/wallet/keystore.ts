import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { ethers } from 'ethers';
import { saveWallet, getWallet, type WalletRow } from '@/db/queries';
import { getPreferences } from '@/utils/preferences';

const KEY_STORE_KEY = 'wayamesh_encrypted_pk';
const MNEMONIC_KEY  = 'wayamesh_mnemonic';

// BIP-44 path for Ethereum-compatible chains (Arc is EVM-compatible, coin type 60)
const DERIVATION_PATH = "m/44'/60'/0'/0/0";

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  requireAuthentication: false,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// ── Biometric gate ────────────────────────────────────────────────────────────

async function biometricGate(message: string): Promise<void> {
  // Skip if user has disabled biometric unlock in settings
  try {
    const prefs = getPreferences();
    if (!prefs.biometric_enabled) return;
  } catch {
    // DB may not be ready yet; default to requiring biometric
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
    fallbackLabel: 'Use passcode',
    cancelLabel: 'Cancel',
  });
  if (!result.success) throw new Error('Authentication failed');
}

// ── Wallet creation ───────────────────────────────────────────────────────────

/**
 * Generate a new HD wallet.
 * Uses 256-bit entropy → 24-word mnemonic (stronger than the 128-bit / 12-word minimum).
 * Derives at the standard BIP-44 path for Ethereum-compatible chains.
 */
export async function createWallet(): Promise<{ address: string; publicKey: string }> {
  const entropy  = ethers.randomBytes(32);
  const mnemonic = ethers.Mnemonic.entropyToPhrase(entropy);
  const hd       = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, DERIVATION_PATH);

  await SecureStore.setItemAsync(KEY_STORE_KEY, hd.privateKey, SECURE_OPTS);
  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic, SECURE_OPTS);

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

  await SecureStore.setItemAsync(KEY_STORE_KEY, wallet.privateKey, SECURE_OPTS);
  if (isMnemonic) {
    await SecureStore.setItemAsync(MNEMONIC_KEY, trimmed, SECURE_OPTS);
  } else {
    await SecureStore.deleteItemAsync(MNEMONIC_KEY);
  }

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

// ── Key retrieval (biometric-gated) ──────────────────────────────────────────

export async function loadWallet(requireBiometric = true): Promise<ethers.Wallet | null> {
  if (requireBiometric) {
    try {
      await biometricGate('Authenticate to access your wallet');
    } catch {
      return null;
    }
  }
  const pk = await SecureStore.getItemAsync(KEY_STORE_KEY);
  return pk ? new ethers.Wallet(pk) : null;
}

export async function loadMnemonic(): Promise<string | null> {
  try {
    await biometricGate('Authenticate to reveal your seed phrase');
  } catch {
    return null;
  }
  return SecureStore.getItemAsync(MNEMONIC_KEY);
}

export async function exportPrivateKey(): Promise<string | null> {
  try {
    await biometricGate('Authenticate to export your private key');
  } catch {
    return null;
  }
  return SecureStore.getItemAsync(KEY_STORE_KEY);
}

/**
 * Export an EIP-55 encrypted keystore JSON.
 * Compatible with MetaMask, Geth, Trust Wallet, and most EVM wallets.
 */
export async function exportKeystoreJSON(password: string): Promise<string | null> {
  try {
    await biometricGate('Authenticate to export your keystore');
  } catch {
    return null;
  }
  const pk = await SecureStore.getItemAsync(KEY_STORE_KEY);
  if (!pk) return null;
  return new ethers.Wallet(pk).encrypt(password);
}

/**
 * EIP-191 personal sign. Required for dApp connections and proving wallet ownership.
 */
export async function signMessage(message: string | Uint8Array): Promise<string | null> {
  try {
    await biometricGate('Authenticate to sign this message');
  } catch {
    return null;
  }
  const pk = await SecureStore.getItemAsync(KEY_STORE_KEY);
  if (!pk) return null;
  return new ethers.Wallet(pk).signMessage(message);
}

// ── Utility ───────────────────────────────────────────────────────────────────

export async function hasWallet(): Promise<boolean> {
  const row: WalletRow | null = getWallet();
  if (!row) return false;
  const key = await SecureStore.getItemAsync(KEY_STORE_KEY);
  return key !== null;
}

export async function deleteWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORE_KEY);
  await SecureStore.deleteItemAsync(MNEMONIC_KEY);
}

export async function biometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled   = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
}
