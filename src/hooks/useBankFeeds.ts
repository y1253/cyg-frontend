import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  bankReconnected,
  createBankLinkToken,
  disconnectBankItem,
  exchangeBankToken,
  fetchBankConfig,
  fetchBankItems,
  setBankStartDates,
  syncBankItem,
  type BankItem,
} from '@/api/bankFeeds';
import { loadPlaid, openPlaidLink } from '@/lib/plaid-link';

const key = (companyId: number) => ['bank-feeds', companyId];

export function useBankFeedsConfig(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...key(companyId), 'config'],
    queryFn: () => fetchBankConfig(token!, companyId),
    enabled: !!token && !!companyId,
    staleTime: 10 * 60_000,
  });
}

/** step11: the company book's bank connections. Polls while history loads or a sync runs. */
export function useBankFeedsStatus(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...key(companyId), 'items'],
    queryFn: () => fetchBankItems(token!, companyId),
    enabled: !!token && !!companyId,
    refetchInterval: (q) =>
      q.state.data?.some((i) => i.syncing || (!i.historyDone && i.status === 'ACTIVE'))
        ? 15_000
        : false,
  });
}

/**
 * Opens Plaid Link. Without `itemId`: a new bank, exchanged on success (the answer is the
 * new connection, whose start dates are asked next). With `itemId`: sign in again, or —
 * with `chooseAccounts` — pick its shared accounts again.
 */
export function useConnectBank(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(
    async (itemId?: number, chooseAccounts = false): Promise<BankItem | null> => {
      if (!token) return null;
      setError(null);
      setBusy(itemId ?? 'new');
      try {
        // Load the script in parallel with the token so Link opens as soon as both are in.
        const [{ linkToken }] = await Promise.all([
          createBankLinkToken(token, companyId, itemId, chooseAccounts),
          loadPlaid(),
        ]);
        const publicToken = await openPlaidLink(linkToken);
        if (!publicToken) return null;
        return itemId
          ? await bankReconnected(token, companyId, itemId)
          : await exchangeBankToken(token, companyId, publicToken);
      } catch (err) {
        setError((err as Error).message);
        return null;
      } finally {
        setBusy(null);
        void qc.invalidateQueries({ queryKey: key(companyId) });
      }
    },
    [token, companyId, qc],
  );

  return { connect, busy, error };
}

export function useSetBankStartDates(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      itemId: number;
      accounts: Array<{ id: number; startDate: string | null }>;
    }) => setBankStartDates(token!, companyId, v.itemId, v.accounts),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key(companyId) });
      void qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] });
    },
  });
}

export function useSyncBankItem(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => syncBankItem(token!, companyId, itemId),
    onSettled: () => qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}

export function useDisconnectBankItem(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => disconnectBankItem(token!, companyId, itemId),
    onSettled: () => qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}
