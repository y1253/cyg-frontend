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
  });
}
