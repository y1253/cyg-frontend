import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChats } from '@/api/gmail';
import type { GmailAccount } from '@/api/gmail';

export function useGmailChats(companyId: number, account: GmailAccount | null | undefined, q?: string) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['gmail-chats', companyId, q ?? ''],
    queryFn: ({ pageParam }) => fetchChats(token!, companyId, pageParam, q),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: !!token && !!companyId && !!account,
    refetchInterval: 15000,
  });
}
