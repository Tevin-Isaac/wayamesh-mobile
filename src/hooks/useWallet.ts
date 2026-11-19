import { useState, useEffect, useCallback } from 'react';
import { hasWallet, createWallet, loadWallet, deleteWallet, importWallet } from '@/wallet/keystore';
import { getWallet, clearWalletData } from '@/db/queries';
import { lockChat } from '@/chat/identity';
import { getUsdcBalance } from '@/wallet/transactions';
import { getCachedBalance, setCachedBalance } from '@/wallet/balanceCache';

export interface WalletState {
  address: string | null;
  /** Exact decimal string, or null when it cannot be known (never a made-up zero). */
  balance: string | null;
  /** True when `balance` is the last known value because the network could not be reached. */
  stale: boolean;
  /** Unix seconds of the last known value when stale. */
  balanceAt: number | null;
  isLoading: boolean;
  hasWallet: boolean;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    balance: null,
    stale: false,
    balanceAt: null,
    isLoading: true,
    hasWallet: false,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true }));
    const exists = await hasWallet();

    if (!exists) {
      setState({ address: null, balance: null, stale: false, balanceAt: null, isLoading: false, hasWallet: false });
      return;
    }

    const row = getWallet();
    const address = row?.address ?? null;

    let balance: string | null = null;
    let stale = false;
    let balanceAt: number | null = null;
    if (address) {
      try {
        balance = await getUsdcBalance(address);
        setCachedBalance(address, balance);
      } catch {
        // Offline or RPC down: fall back to the last value we really read, clearly marked as last known.
        const cached = getCachedBalance(address);
        if (cached) { balance = cached.amount; stale = true; balanceAt = cached.updatedAt; }
      }
    }

    setState({ address, balance, stale, balanceAt, isLoading: false, hasWallet: true });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true }));
    const { address } = await createWallet();
    // Don't assume a balance: show unknown until the chain has been read (a brand-new wallet then reads 0 for real).
    setState({ address, balance: null, stale: false, balanceAt: null, isLoading: false, hasWallet: true });
    refresh();
  }, [refresh]);

  const importExisting = useCallback(async (privateKeyOrMnemonic: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    const { address } = await importWallet(privateKeyOrMnemonic);
    setState({ address, balance: null, stale: false, balanceAt: null, isLoading: false, hasWallet: true });
  }, []);

  const logout = useCallback(async () => {
    lockChat();
    await deleteWallet();
    clearWalletData();
    setState({ address: null, balance: null, stale: false, balanceAt: null, isLoading: false, hasWallet: false });
  }, []);

  const unlock = useCallback(async () => {
    return loadWallet();
  }, []);

  return { ...state, refresh, create, importExisting, logout, unlock };
}
