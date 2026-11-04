import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  createBankLinkToken,
  disconnectBankItem,
  exchangeBankToken,
  fetchBankFeedsStatus,
  syncBankItem,
} from '@/api/bankFeeds';
import { loadPlaid, openPlaidLink } from '@/lib/plaid-link';

const key = (companyId: number) => ['bank-feeds', companyId];

/** step2.md: the company's Plaid bank connections. Polls while a first sync is running. */
export function useBankFeedsStatus(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: key(companyId),
    queryFn: () => fetchBankFeedsStatus(token!, companyId),
    enabled: !!token && !!companyId,
    refetchInterval: (q) =>
      q.state.data?.items.some((i) => i.syncing || (!i.historyDone && i.status === 'ACTIVE'))
        ? 15_000
        : false,
  });
}

/**
 * Opens Plaid Link. Without `itemId`: a new bank login, exchanged on success. With
 * `itemId`: update mode (sign in again) — no exchange, a sync instead.
 */
export function useConnectBank(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(
    async (itemId?: number) => {
      if (!token) return;
      setError(null);
      setBusy(itemId ?? 'new');
      try {
        // Load the script in parallel with the token so Link opens as soon as both are in.
        const [{ linkToken }] = await Promise.all([
          createBankLinkToken(token, companyId, itemId),
          loadPlaid(),
        ]);
        const publicToken = await openPlaidLink(linkToken);
        if (!publicToken) return;
        if (itemId) await syncBankItem(token, itemId);
        else await exchangeBankToken(token, companyId, publicToken);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
        void qc.invalidateQueries({ queryKey: key(companyId) });
      }
    },
    [token, companyId, qc],
  );

  return { connect, busy, error };
}

export function useSyncBankItem(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => syncBankItem(token!, itemId),
    onSettled: () => qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}

export function useDisconnectBankItem(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => disconnectBankItem(token!, itemId),
    onSettled: () => qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}
