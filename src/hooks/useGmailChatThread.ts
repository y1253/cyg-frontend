import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChatThread } from '@/api/gmail';

export function useGmailChatThread(
  companyId: number,
  spaceId: string | null,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useQuery({
    // Thread content depends only on the space now (the whole recent
    // conversation is returned; re-anchoring to a different message is
    // handled client-side, so no per-message refetch is needed).
    queryKey: ['gmail-chat-thread', companyId, spaceId],
    queryFn: () => fetchChatThread(token!, companyId, spaceId!),
    // See useGmailEmails: the tab is kept mounted while hidden, so polling follows
    // visibility, not mount. keepPreviousData keeps the thread rendered meanwhile.
    enabled: !!token && !!companyId && !!spaceId && active,
    placeholderData: keepPreviousData,
    refetchInterval: active ? 15000 : false,
  });
}
