import { useState, useEffect, useCallback } from 'react';
import { hasWallet, createWallet, loadWallet } from '@/wallet/keystore';
import { getWallet } from '@/db/queries';
import { getUsdcBalance } from '@/wallet/transactions';

export interface WalletState {
  address: string | null;
  balance: string | null;
  isLoading: boolean;
  hasWallet: boolean;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    balance: null,
    isLoading: true,
    hasWallet: false,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true }));
    const exists = await hasWallet();

    if (!exists) {
      setState({ address: null, balance: null, isLoading: false, hasWallet: false });
      return;
    }

    const row = getWallet();
    const address = row?.address ?? null;

    let balance: string | null = null;
    if (address) {
      try {
        balance = await getUsdcBalance(address);
      } catch {
        balance = null;
      }
    }

    setState({ address, balance, isLoading: false, hasWallet: true });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true }));
    const { address } = await createWallet();
    setState({ address, balance: '0.00', isLoading: false, hasWallet: true });
  }, []);

  const unlock = useCallback(async () => {
    return loadWallet(true);
  }, []);

  return { ...state, refresh, create, unlock };
}
