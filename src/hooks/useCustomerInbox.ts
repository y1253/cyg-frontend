import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disconnectCustomerInbox, fetchCustomerInbox, syncCustomerInbox } from '@/api/customerInbox';
import { useAuth } from '@/context/AuthContext';

export const CUSTOMER_INBOX_KEY = ['customer-inbox'] as const;

/** The firm's customer inbox and what it handled (step12). Refreshes every 20s while shown. */
export function useCustomerInbox(fast = false) {
  const { token } = useAuth();
  return useQuery({
    queryKey: CUSTOMER_INBOX_KEY,
    queryFn: () => fetchCustomerInbox(token!),
    enabled: !!token,
    // While a connect popup is open, look every 2s so the card flips as soon as it is done.
    refetchInterval: q => (fast && !q.state.data?.connected ? 2_000 : 20_000),
  });
}

export function useSyncCustomerInbox() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncCustomerInbox(token!),
    // The sweep runs in the background; look again once it has had a moment.
    onSuccess: () => setTimeout(() => void qc.invalidateQueries({ queryKey: CUSTOMER_INBOX_KEY }), 4_000),
  });
}

export function useDisconnectCustomerInbox() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectCustomerInbox(token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_INBOX_KEY }),
  });
}
