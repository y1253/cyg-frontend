import { useQuery } from '@tanstack/react-query';
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
    // distinct threads (each frozen at its own moment).
    queryKey: ['gmail-chat-thread', companyId, spaceId, openedMessageId ?? null],
    queryFn: () => fetchChatThread(token!, companyId, spaceId!, undefined, untilCreateTime ?? undefined),
    enabled: !!token && !!companyId && !!spaceId,
    refetchInterval: 15000,
  });
}
