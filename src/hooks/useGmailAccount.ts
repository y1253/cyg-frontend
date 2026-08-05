import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchGmailAccount } from '@/api/gmail';

export function useGmailAccount(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-account', companyId],
    queryFn: () => fetchGmailAccount(token!, companyId),
    enabled: !!token && !!companyId,
    // Every other query in the Communications tab is `enabled`-gated on this one's
    // result, and the tab renders nothing at all while it is pending — so a retry
    // chain here stalls the whole surface. A bad response is not transient anyway.
    retry: false,
  });
}
