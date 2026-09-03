import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchInternalCalls, type InternalCall } from '@/api/internalCalls';

/**
 * This user's staff-to-staff call history.
 *
 * Polls only while the tab is on screen, matching the internal-messages convention —
 * a call that just ended is finalised lazily server-side, so a refetch is what fills
 * in its duration.
 */
export function useInternalCalls(active: boolean) {
  const { token } = useAuth();
  return useQuery<InternalCall[]>({
    queryKey: ['internal-calls'],
    queryFn: () => fetchInternalCalls(token!),
    enabled: !!token && active,
    refetchInterval: active ? 15000 : false,
  });
}
