import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchRingingCall } from '@/api/phone';

/**
 * Is a call ringing for this company right now?
 *
 * `enabled` is expected to include "this browser is holding an unpaired INVITE". That
 * gate is what keeps this cheap: with nothing to answer there is nothing worth knowing,
 * so the query is idle except during an actual ring — and it makes the real limitation
 * honest, since an admin whose app was closed when the call arrived has no INVITE, gets
 * no banner, and genuinely cannot answer.
 *
 * 3s because a ring lasts 30: slower and the call is half over before it appears.
 */
export function useRingingCall(companyId: number, enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['phone-ringing', companyId],
    queryFn: () => fetchRingingCall(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    refetchInterval: 3000,
    // A ring is over in seconds; a cached answer is worse than no answer.
    staleTime: 0,
    gcTime: 0,
  });
}
