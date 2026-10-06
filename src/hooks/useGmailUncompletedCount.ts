import { useBackstop } from '@/lib/realtime-status';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchUncompletedCount } from '@/api/gmail';
import type { GmailAccount } from '@/api/gmail';

export function useGmailUncompletedCount(companyId: number, account: GmailAccount | null | undefined) {
  const { token } = useAuth();
  // The realtime channel announces changes; this poll is only the backstop.
  const pollMs = useBackstop(30000);
  return useQuery({
    queryKey: ['gmail-uncompleted-count', companyId],
    queryFn: () => fetchUncompletedCount(token!, companyId),
    enabled: !!token && !!companyId && !!account,
    refetchInterval: pollMs,
  });
}
