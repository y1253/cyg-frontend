import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmails } from '@/api/gmail';

export function useGmailEmails(companyId: number, pageToken?: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-emails', companyId, pageToken],
    queryFn: () => fetchEmails(token!, companyId, pageToken),
    enabled: !!token && !!companyId,
    refetchInterval: 60000,
  });
}
