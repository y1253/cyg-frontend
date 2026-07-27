import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmail } from '@/api/gmail';

export function useGmailEmail(
  companyId: number,
  messageId: string | null,
  immutable = false,
) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-email', companyId, messageId, immutable],
    queryFn: () => fetchEmail(token!, companyId, messageId!, immutable),
    enabled: !!token && !!companyId && !!messageId,
  });
}
