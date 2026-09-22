import { useQuery } from '@tanstack/react-query';
import { fetchPresence } from '@/api/phone';
import { useAuth } from '@/context/AuthContext';

/**
 * Which colleagues are reachable, and which are on a call.
 *
 * Presence used to mean "has an SSE stream open" alone, which was close to useless here:
 * the office TLS-intercepting proxy blackholes SSE entirely — the reason the softphone
 * has a polled `pending` fallback at all — so a colleague at their desk reported offline.
 * It now also counts a recent posted heartbeat, which is an ordinary request and gets
 * through, and that heartbeat is the only thing that can report BUSY: an inbound call
 * rings every browser on one shared SIP credential, so the server is never told which of
 * them answered.
 *
 * ⚠️ STILL ADVISORY ONLY, and more dangerous for looking reliable. Somebody with the app
 * closed is simply absent, which is indistinguishable here from a heartbeat one second
 * late. Show it as a hint; never filter a picker on it and never refuse a call or a
 * transfer because of it.
 *
 * Polls rather than merely going stale, because every consumer is a surface that is OPEN
 * in front of somebody deciding who to ring — a dot that was right when the popover
 * opened and wrong ten seconds later is worse than no dot.
 */
export function usePresence(enabled: boolean = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['phone-presence'],
    queryFn: () => fetchPresence(token!),
    enabled: !!token && enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 15_000 : false,
  });
}
