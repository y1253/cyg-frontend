import { useBackstop } from '@/lib/realtime-status';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchInternalUncompletedCount,
  fetchInternalUnreadCount,
} from '@/api/internalMessages';

/** Drives the folder-tab badge inside the tab (the dashboard badge comes from
 *  /communications/uncompleted-counts, which folds this same number in). */
export function useInternalUncompletedCount() {
  const { token } = useAuth();
  // The realtime channel announces changes; this poll is only the backstop.
  const pollMs = useBackstop(30000);
  return useQuery({
    queryKey: ['internal-uncompleted-count'],
    queryFn: () => fetchInternalUncompletedCount(token!),
    enabled: !!token,
    refetchInterval: pollMs,
  });
}

export function useInternalUnreadCount() {
  const { token } = useAuth();
  // The realtime channel announces changes; this poll is only the backstop.
  const pollMs = useBackstop(30000);
  return useQuery({
    queryKey: ['internal-unread-count'],
    queryFn: () => fetchInternalUnreadCount(token!),
    enabled: !!token,
    refetchInterval: pollMs,
    // Also the new-message notifier's fallback for internal mail when the SSE
    // stream is down. A backgrounded tab still has to alert, which is exactly when
    // React Query would otherwise stop polling.
    refetchIntervalInBackground: true,
  });
}
