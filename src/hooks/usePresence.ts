import { useQuery } from '@tanstack/react-query';
import { fetchPresence } from '@/api/phone';
import { useAuth } from '@/context/AuthContext';

/**
 * Which colleagues currently hold an open event stream.
 *
 * ⚠️ ADVISORY ONLY. Presence here means "has an SSE stream open", and the office
 * TLS-intercepting proxy blackholes SSE entirely — which is why the softphone has a
 * polled `pending` fallback at all. So a colleague sitting at their desk on the office
 * network reports offline. Show it as a hint; never filter a picker on it and never
 * refuse a transfer because of it.
 *
 * Short `staleTime`: it is only fetched while a picker is open, and being a minute stale
 * about who is at their desk would defeat the point.
 */
export function usePresence(enabled: boolean = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['phone-presence'],
    queryFn: () => fetchPresence(token!),
    enabled: !!token && enabled,
    staleTime: 15_000,
  });
}
