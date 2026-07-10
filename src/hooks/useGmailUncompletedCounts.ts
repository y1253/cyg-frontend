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
  });
}
