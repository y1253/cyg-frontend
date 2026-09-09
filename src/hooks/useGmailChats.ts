import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChats } from '@/api/gmail';
import type { GmailAccount } from '@/api/gmail';

export function useGmailChats(
  companyId: number,
  account: GmailAccount | null | undefined,
  q?: string,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['gmail-chats', companyId, q ?? ''],
    queryFn: ({ pageParam }) => fetchChats(token!, companyId, pageParam, q),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    // See useGmailEmails: the tab is kept mounted while hidden, so polling follows
    // visibility, not mount.
    enabled: !!token && !!companyId && !!account && active,
    refetchInterval: active ? 15000 : false,
    // Under the 15s poll interval, so polling is unaffected — this only stops the
    // OTHER refetch trigger: at staleTime 0 every window focus and remount refetched
    // EVERY loaded page (TanStack refetches an infinite query's whole page array),
    // which after a few pages is the dominant request source.
    staleTime: 10_000,
  });
}
