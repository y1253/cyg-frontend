import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmails } from '@/api/gmail';

export function useGmailEmails(
  companyId: number,
  labelId: string = 'INBOX',
  q?: string,
  active: boolean = true,
  /** Advanced-search params from `filterParams`, plus a stable key for the cache. */
  filters?: Record<string, string>,
  filterKey: string = '',
) {
  const { token } = useAuth();
  return useInfiniteQuery({
    // filterKey is part of the key or React Query serves another search's pages.
    queryKey: ['gmail-emails', companyId, labelId, q ?? '', filterKey],
    queryFn: ({ pageParam }) =>
      fetchEmails(token!, companyId, pageParam, labelId, q, filters),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    // The Communications tab stays mounted while hidden (so an open message and any
    // draft survive a tab switch), so polling is gated on visibility rather than on
    // mount. Re-enabling refetches at once (staleTime is 0), so the list is fresh
    // the moment the user comes back.
    enabled: !!token && !!companyId && active,
    refetchInterval: active ? 15000 : false,
    // Under the 15s poll interval, so polling is unaffected — this only stops the
    // OTHER refetch trigger: at staleTime 0 every window focus and remount refetched
    // EVERY loaded page (TanStack refetches an infinite query's whole page array),
    // which after a few pages is the dominant request source.
    staleTime: 10_000,
  });
}
