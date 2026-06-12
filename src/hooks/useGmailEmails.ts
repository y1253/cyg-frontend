import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmails } from '@/api/gmail';

export function useGmailEmails(companyId: number, pageToken?: string, labelId: string = 'INBOX') {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-emails', companyId, pageToken, labelId],
    queryFn: () => fetchEmails(token!, companyId, pageToken, labelId),
    enabled: !!token && !!companyId,
    refetchInterval: 15000,
  });
}
