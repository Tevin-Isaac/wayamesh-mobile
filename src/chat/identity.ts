import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import { buildCard, chatPubkeyOf, deriveChatKey, renameCard, type WalletSigner } from './crypto';

// Phone chat identity. The chat key is derived ONCE from the wallet key (HKDF, info 'wayamesh-chat-v1') the first
// time the wallet key is in hand, then stored WITHOUT requireAuthentication so incoming messages can be decrypted
// without a biometric prompt. It is a separate, lower-value key: it can read chat messages but cannot move funds.
// The signed contact card (public data) is cached next to it.

const CHAT_KEY = 'wayamesh_chat_key';
const CARD_KEY = 'wayamesh_chat_card';
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let cachedKey: string | null = null;

export async function getChatKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  try {
    cachedKey = await SecureStore.getItemAsync(CHAT_KEY, OPTS);
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

export async function getMyCard(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CARD_KEY, OPTS);
  } catch {
    return null;
  }
}

/**
 * Call whenever the wallet private key is legitimately in memory (create, import, unlock). Derives and stores the
 * chat key and signs the contact card if either is missing. Never throws: chat setup must not break wallet flows.
 */
export async function ensureChatIdentity(walletPrivateKey: string): Promise<void> {
  try {
    let key = await getChatKey();
    if (!key) {
      key = deriveChatKey(walletPrivateKey);
      await SecureStore.setItemAsync(CHAT_KEY, key, OPTS);
      cachedKey = key;
    }
    if (!(await getMyCard())) {
      const w = new ethers.Wallet(walletPrivateKey);
      const signer: WalletSigner = { address: w.address, signMessage: (m) => w.signMessage(m) };
      await SecureStore.setItemAsync(CARD_KEY, await buildCard(signer, chatPubkeyOf(key), ''), OPTS);
    }
  } catch {
    // retried at the next unlock
  }
}

export async function setMyName(name: string): Promise<string | null> {
  const card = await getMyCard();
  if (!card) return null;
  const next = renameCard(card, name.trim());
  await SecureStore.setItemAsync(CARD_KEY, next, OPTS);
  return next;
}

export async function clearChatIdentity(): Promise<void> {
  cachedKey = null;
  try {
    await SecureStore.deleteItemAsync(CHAT_KEY);
    await SecureStore.deleteItemAsync(CARD_KEY);
  } catch {
    // ignore
  }
}
