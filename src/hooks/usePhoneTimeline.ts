import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchPhoneTimeline } from '@/api/phone';

/**
 * The company's calls + SMS, paged on a timestamp cursor.
 *
 * Structurally the same as `useGmailChats`: the tab stays mounted while hidden, so
 * polling follows visibility rather than mount. `enabled` also gates on the company
 * having a support number — without one the endpoint would answer an empty page
 * forever, and an always-empty source still costs a request every 15 seconds.
 */
export function usePhoneTimeline(
  companyId: number,
  hasNumber: boolean,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['phone-timeline', companyId],
    queryFn: ({ pageParam }) =>
      fetchPhoneTimeline(token!, companyId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.hasMore ? (last.nextCursor ?? undefined) : undefined,
    enabled: !!token && !!companyId && hasNumber && active,
    refetchInterval: active ? 15000 : false,
    // Under the 15s poll interval, so polling is unaffected — this only stops the
    // OTHER refetch trigger: at staleTime 0 every window focus and remount refetched
    // EVERY loaded page (TanStack refetches an infinite query's whole page array),
    // which after a few pages is the dominant request source.
    staleTime: 10_000,
    // Leaving the tab for longer than the default 5-minute gcTime threw the loaded pages
    // away, so coming back re-entered the cold path and the list had nothing to show.
    gcTime: 30 * 60_000,
    // No `placeholderData: keepPreviousData` on purpose: the key is static, so there is no
    // previous key to carry data from and it would do exactly nothing. What keeps a poll
    // from blanking the list is the stable key plus `showListSpinner`.
  });
}
