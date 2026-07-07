import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchGmailContacts } from '@/api/gmail';

// Past recipients/senders for recipient autocomplete. The endpoint scans recent
// SENT + INBOX messages (~100 Gmail calls), so it's gated behind `enabled` (fire
// only when composing) and cached with a long staleTime — fetched once per session.
export function useGmailContacts(companyId: number, enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-contacts', companyId],
    queryFn: () => fetchGmailContacts(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
