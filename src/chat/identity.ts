import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { loadWallet } from '@/wallet/keystore';
import { getMeta, setMeta } from '@/db/chat';
import { encodeCard, pubkeyOf, toChecksumAddress, addressOfPubkey, type Address, type Hex, type Signer, signerFromKey } from './crypto';

// Phone chat identity = the WALLET key (same as the Arc Studio web wallet). The wallet key is biometric-gated, so chat is
// unlocked ONCE per app session (one biometric prompt when the user opens Chats, sends or pays). While unlocked the key lives
// only in memory (never written anywhere) and is wiped when the app leaves the foreground, on lock, and on logout.
// Nothing about chat is persisted unprotected: the previous design's derived chat key (SecureStore) is deleted at first run.

export interface ChatSession {
  /** wallet private key, 0x hex. In memory only. */
  privateKey: Hex;
  address: Address;
  pubkey: Hex;
  signer: Signer;
}

let session: ChatSession | null = null;
let pending: Promise<boolean> | null = null;
let version = 0;
const listeners = new Set<() => void>();
function emit() { version++; listeners.forEach((l) => l()); }

export function getSession(): ChatSession | null { return session; }
export function isChatUnlocked(): boolean { return session !== null; }

export function subscribeChatLock(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
/** React hook: true while the chat key is in memory. */
export function useChatUnlocked(): boolean {
  useSyncExternalStore(subscribeChatLock, () => version, () => version);
  return session !== null;
}

/**
 * Runs one biometric auth through the keystore (loadWallet) and keeps the derived chat material in memory.
 * Resolves false if the user cancels. Concurrent callers share one prompt.
 */
export function unlockChat(): Promise<boolean> {
  if (session) return Promise.resolve(true);
  if (pending) return pending;
  pending = (async () => {
    try {
      const w = await loadWallet();
      if (!w) return false;
      const pk = (w.privateKey.startsWith('0x') ? w.privateKey : `0x${w.privateKey}`) as Hex;
      const pubkey = pubkeyOf(pk);
      session = { privateKey: pk, address: addressOfPubkey(pubkey), pubkey, signer: signerFromKey(pk) };
      emit();
      return true;
    } catch {
      return false;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Wipes the in-memory key (best effort: JS strings cannot be zeroed, so references are dropped). */
export function lockChat(): void {
  if (!session) return;
  session = null;
  emit();
}

export function myCardText(): string | null {
  if (!session) return null;
  return encodeCard({ address: session.address, pubkey: session.pubkey, name: getMyName() });
}

export function getMyName(): string {
  try { return getMeta('my_name') ?? ''; } catch { return ''; }
}
export function setMyName(name: string): void {
  setMeta('my_name', name.trim().slice(0, 24));
}

const LEGACY_KEYS = ['wayamesh_chat_key', 'wayamesh_chat_card'];

/** Removes the previous design's unprotected derived chat key and cached card. Safe to call on every start. */
export async function purgeLegacyChatKey(): Promise<void> {
  for (const k of LEGACY_KEYS) {
    try { await SecureStore.deleteItemAsync(k); } catch { /* not present */ }
  }
}

export { toChecksumAddress };
