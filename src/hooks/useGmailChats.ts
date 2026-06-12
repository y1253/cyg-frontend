import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChats } from '@/api/gmail';
import type { GmailAccount } from '@/api/gmail';

export function useGmailChats(companyId: number, account: GmailAccount | null | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-chats', companyId],
    queryFn: () => fetchChats(token!, companyId),
    enabled: !!token && !!companyId && !!account,
    refetchInterval: 15000,
  });
}
