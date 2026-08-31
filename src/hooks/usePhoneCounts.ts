import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchPhoneCounts } from '@/api/phone';

/**
 * Unread / uncompleted phone counts, folded into this company's folder badges.
 *
 * Per-company and on demand. The dashboard's cross-company badge deliberately does
 * NOT include phone: that endpoint answers for every company on a 60s poll, and a
 * phone count costs five SignalWire requests each.
 */
export function usePhoneCounts(
  companyId: number,
  hasNumber: boolean,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['phone-counts', companyId],
    queryFn: () => fetchPhoneCounts(token!, companyId),
    enabled: !!token && !!companyId && hasNumber && active,
    refetchInterval: active ? 60000 : false,
  });
}
