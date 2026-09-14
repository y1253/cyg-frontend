import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchActiveCall } from '@/api/phone';

/**
 * Is this company's line on a call right now — in any browser, for anyone?
 *
 * Deliberately NOT gated on this browser holding an INVITE, unlike `useRingingCall`: the
 * whole point is to show a call somebody ELSE is on, and to disable dialling out while it
 * lasts. 4s because the buttons stay enabled for at most one interval after a call starts
 * elsewhere; the server refuses the dial regardless.
 */
export function useActiveCall(companyId: number, enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['phone-active-call', companyId],
    queryFn: () => fetchActiveCall(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    refetchInterval: 4000,
    staleTime: 0,
  });
}
