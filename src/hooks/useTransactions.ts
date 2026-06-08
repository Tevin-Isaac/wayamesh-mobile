import { useState, useEffect, useCallback } from 'react';
import { getTransactions, getPendingTransactions, type TransactionRow } from '@/db/queries';

export function useTransactions() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(() => {
    setTransactions(getTransactions(50));
    setPendingCount(getPendingTransactions().length);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { transactions, pendingCount, refresh };
}
