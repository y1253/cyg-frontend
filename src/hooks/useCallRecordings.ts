import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCallRecordings } from '@/api/phone';

/** Recordings for one call. Fetched only when its detail view is open. */
export function useCallRecordings(companyId: number, sid: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['call-recordings', companyId, sid ?? ''],
    queryFn: () => fetchCallRecordings(token!, companyId, sid!),
    enabled: !!token && !!companyId && !!sid,
    // A recording does not change once it exists.
    staleTime: 5 * 60_000,
  });
}
