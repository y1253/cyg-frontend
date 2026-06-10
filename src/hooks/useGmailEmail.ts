import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmail } from '@/api/gmail';

export function useGmailEmail(companyId: number, messageId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-email', companyId, messageId],
    queryFn: () => fetchEmail(token!, companyId, messageId!),
    enabled: !!token && !!companyId && !!messageId,
  });
}
