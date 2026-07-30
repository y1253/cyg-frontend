import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchUncompletedCounts } from '@/api/gmail';

export function useGmailUncompletedCounts() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-uncompleted-counts'],
    queryFn: () => fetchUncompletedCounts(token!),
    enabled: !!token,
    // Matches the server-side TTL — polling faster would just re-read its cache.
    refetchInterval: 60000,
    // React Query treats a hidden tab as "not focused" and skips interval fetches,
    // but this query is also the only signal the new-message notifier has for email
    // and chat — and it only ever notifies while the tab ISN'T focused. Without this
    // flag a backgrounded tab would never alert at all.
    refetchIntervalInBackground: true,
  });
}
