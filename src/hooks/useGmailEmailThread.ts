import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmailThread } from '@/api/gmail';

export function useGmailEmailThread(
  companyId: number,
  threadId: string | null,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useQuery({
    // The whole conversation is returned for the thread id; per-message
    // expand/collapse is handled client-side, so no per-message refetch.
    queryKey: ['gmail-email-thread', companyId, threadId],
    queryFn: () => fetchEmailThread(token!, companyId, threadId!),
    // Mirrors useGmailChatThread: the tab stays mounted while hidden, so polling
    // follows visibility. keepPreviousData keeps the thread rendered meanwhile.
    enabled: !!token && !!companyId && !!threadId && active,
    placeholderData: keepPreviousData,
    refetchInterval: active ? 15000 : false,
  });
}
