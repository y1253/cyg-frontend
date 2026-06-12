import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchUnreadCount } from '@/api/gmail';
import type { GmailAccount } from '@/api/gmail';

export function useGmailUnreadCount(companyId: number, account: GmailAccount | null | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-unread-count', companyId],
    queryFn: () => fetchUnreadCount(token!, companyId),
    enabled: !!token && !!companyId && !!account,
    refetchInterval: 30000,
  });
}
