import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChatThread } from '@/api/gmail';

export function useGmailChatThread(companyId: number, spaceId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-chat-thread', companyId, spaceId],
    queryFn: () => fetchChatThread(token!, companyId, spaceId!),
    enabled: !!token && !!companyId && !!spaceId,
    refetchInterval: 15000,
  });
}
