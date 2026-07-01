import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChatThread } from '@/api/gmail';

export function useGmailChatThread(companyId: number, spaceId: string | null) {
  const { token } = useAuth();
  return useQuery({
    // Thread content depends only on the space now (the whole recent
    // conversation is returned; re-anchoring to a different message is
    // handled client-side, so no per-message refetch is needed).
    queryKey: ['gmail-chat-thread', companyId, spaceId],
    queryFn: () => fetchChatThread(token!, companyId, spaceId!),
    enabled: !!token && !!companyId && !!spaceId,
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
}
