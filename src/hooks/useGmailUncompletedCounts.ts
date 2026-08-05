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
    // but this query is the only signal the new-message notifier has for email and
    // chat. Without this flag a backgrounded tab — the case where an alert matters
    // most — would never fire one.
    refetchIntervalInBackground: true,
  });
}
