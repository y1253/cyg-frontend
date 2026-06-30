import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChatThread } from '@/api/gmail';

export function useGmailChatThread(
  companyId: number,
  spaceId: string | null,
  openedMessageId?: string | null,
  untilCreateTime?: string | null,
) {
  const { token } = useAuth();
  return useQuery({
    // Key by the opened message so different rows of the same space yield
    // distinct threads (each frozen at its own moment). Include the cutoff so
    // advancing it (e.g. after sending a reply) triggers a refetch.
    queryKey: ['gmail-chat-thread', companyId, spaceId, openedMessageId ?? null, untilCreateTime ?? null],
    queryFn: () => fetchChatThread(token!, companyId, spaceId!, undefined, untilCreateTime ?? undefined),
    enabled: !!token && !!companyId && !!spaceId,
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
}
