import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { ethers } from 'ethers';
import { saveWallet, getWallet, type WalletRow } from '@/db/queries';

const KEY_STORE_KEY = 'wayamesh_encrypted_pk';

export async function createWallet(): Promise<{ address: string; publicKey: string }> {
  const wallet = ethers.Wallet.createRandom();

  await SecureStore.setItemAsync(KEY_STORE_KEY, wallet.privateKey, {
    requireAuthentication: false,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });

  saveWallet({
    address: wallet.address,
    public_key: wallet.publicKey,
    encrypted_key: '[SecureStore]',
  });

  return { address: wallet.address, publicKey: wallet.publicKey };
}

export async function importWallet(
  privateKeyOrMnemonic: string,
): Promise<{ address: string; publicKey: string }> {
  const trimmed = privateKeyOrMnemonic.trim();
  const wordCount = trimmed.split(/\s+/).length;

  const wallet = wordCount >= 12
    ? ethers.Wallet.fromPhrase(trimmed)
    : new ethers.Wallet(trimmed);

  await SecureStore.setItemAsync(KEY_STORE_KEY, wallet.privateKey, {
    requireAuthentication: false,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });

  saveWallet({
    address: wallet.address,
    public_key: wallet.publicKey,
    encrypted_key: '[SecureStore]',
  });

  return { address: wallet.address, publicKey: wallet.publicKey };
}

export async function loadWallet(requireBiometric = true): Promise<ethers.Wallet | null> {
  if (requireBiometric) {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access your Wayamesh wallet',
      fallbackLabel: 'Use passcode',
    });
    if (!auth.success) return null;
  }

  const privateKey = await SecureStore.getItemAsync(KEY_STORE_KEY);
  if (!privateKey) return null;

  return new ethers.Wallet(privateKey);
}

export async function hasWallet(): Promise<boolean> {
  const row: WalletRow | null = getWallet();
  if (!row) return false;
  const key = await SecureStore.getItemAsync(KEY_STORE_KEY);
  return key !== null;
}

export async function deleteWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORE_KEY);
}

export async function biometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
}
