import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchInboxSummary } from '@/api/gmail';
import { useDismissedIds } from '@/lib/unreadFeedDismiss';

/**
 * Both cross-company surfaces from ONE request: the dashboard's uncompleted badge map
 * and the notification bell's unread feed.
 *
 * They share an endpoint because they used to be two, which meant two 60s polls sweeping
 * the same companies — and because the server can only share its phone cache window
 * between them when both are answered in one request.
 *
 * Three components mount this (the dashboard, the new-message notifier, the bell) and
 * each reads only its own half. React Query dedupes them onto a single request by key,
 * so the bell needs no fetch of its own.
 */
export function useInboxSummary() {
  const { token } = useAuth();
  const dismissed = useDismissedIds();

  const query = useQuery({
    queryKey: ['inbox-summary'],
    queryFn: () => fetchInboxSummary(token!),
    enabled: !!token,
    // Matches the server-side TTL — polling faster would just re-read its cache.
    refetchInterval: 60000,
    // React Query treats a hidden tab as "not focused" and skips interval fetches, but
    // this query is the only signal the new-message notifier has for email and chat.
    // Without this flag a backgrounded tab — the case where an alert matters most —
    // would never fire one.
    refetchIntervalInBackground: true,
  });

  /**
   * Rows the user has just read are filtered out here rather than waiting for the next
   * sweep: the server caches each company for 55s, so a refetch straight after a
   * mark-read would return the item again and the row would flicker back.
   */
  const unread = useMemo(
    () => (query.data?.unread ?? []).filter((i) => !dismissed.has(i.id)),
    [query.data, dismissed],
  );

  return {
    ...query,
    /** GLOBAL — every company. Absent key means unknown, NOT zero. */
    uncompleted: query.data?.uncompleted,
    /** ASSIGNMENT-SCOPED — only companies this user is responsible for. */
    unread,
    /** The bell's badge. One source with the list, so they can never disagree. */
    count: unread.length,
    truncated: query.data?.truncated ?? false,
    failed: query.data?.failed ?? [],
  };
}
