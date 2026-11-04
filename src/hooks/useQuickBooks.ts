import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  disconnectQuickBooks,
  fetchQuickBooksAuthUrl,
  fetchQuickBooksStatus,
} from '@/api/quickbooks';

/** step2.md: the company's QuickBooks Online connection. */
export function useQuickBooksStatus(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['quickbooks', companyId],
    queryFn: () => fetchQuickBooksStatus(token!, companyId),
    enabled: !!token && !!companyId,
  });
}

/**
 * Opens Intuit's sign-in in a popup (opened inside the click, so no blocker eats it). The
 * popup's success / error page posts a message; closing it by hand re-reads the status too.
 */
export function useConnectQuickBooks(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!token) return;
    setError(null);
    setConnecting(true);
    const popup = window.open('', 'quickbooks-oauth', 'width=520,height=680');
    try {
      const { authUrl } = await fetchQuickBooksAuthUrl(token, companyId);
      if (popup) popup.location.href = authUrl;
      else window.location.href = authUrl;
    } catch (err) {
      popup?.close();
      setConnecting(false);
      setError((err as Error).message);
      return;
    }
    const done = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      setConnecting(false);
      void qc.invalidateQueries({ queryKey: ['quickbooks', companyId] });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const type = (e.data as { type?: string } | null)?.type;
      if (type === 'quickbooks-connected') done();
      if (type === 'quickbooks-error') {
        setError('QuickBooks was not connected.');
        done();
      }
    };
    window.addEventListener('message', onMessage);
    const poll = setInterval(() => {
      if (!popup || popup.closed) done();
    }, 1000);
  }, [token, companyId, qc]);

  return { connect, connecting, error };
}

export function useDisconnectQuickBooks(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectQuickBooks(token!, companyId),
    onSettled: () => qc.invalidateQueries({ queryKey: ['quickbooks', companyId] }),
  });
}
