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
  });
}
