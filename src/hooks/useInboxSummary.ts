import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchInboxSummary } from '@/api/gmail';
import { useDismissedIds } from '@/lib/unreadFeedDismiss';
import { adjustMissedForDismissed } from '@/components/Layout/unread-feed';

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

  /**
   * The same dismissal, applied to the NUMBERS.
   *
   * Filtering `unread` above only fixes what the bell LISTS. The header pill, the browser
   * tab badge and the dashboard's per-company badge all read server scalars, which no
   * amount of row-hiding can move — so marking a missed call read used to leave them
   * showing the old figure until a refetch landed. See `adjustMissedForDismissed` for why
   * this cannot double-subtract once the server catches up.
   */
  const missed = useMemo(
    () =>
      adjustMissedForDismissed({
        rawUnread: query.data?.unread ?? [],
        missedCalls: query.data?.missedCalls,
        missedCallsOwn: query.data?.missedCallsOwn ?? 0,
        dismissed,
      }),
    [query.data, dismissed],
  );

  return {
    ...query,
    /** GLOBAL — every company. Absent key means unknown, NOT zero. */
    uncompleted: query.data?.uncompleted,
    /** GLOBAL unread missed calls per company. Absent key means unknown, NOT zero. */
    missedCalls: missed.missedCalls,
    /** ASSIGNMENT-SCOPED total of the same — the red number on the browser tab. */
    missedCallsOwn: missed.missedCallsOwn,
    /** ASSIGNMENT-SCOPED — only companies this user is responsible for. */
    unread,
    /** The bell's badge. One source with the list, so they can never disagree. */
    count: unread.length,
    truncated: query.data?.truncated ?? false,
    failed: query.data?.failed ?? [],
  };
}
