import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchBrowserSession, fetchBrowserSessions } from '@/api/agents';
import { useBackstop } from '@/lib/realtime-status';

/** step11 part 2: the agent's stretches on its browser, newest first. */
export function useBrowserSessions(companyId: number, agentId: number) {
  const { token } = useAuth();
  const interval = useBackstop(30_000);
  return useQuery({
    queryKey: ['agent-browser-sessions', companyId, agentId],
    queryFn: () => fetchBrowserSessions(token!, companyId, agentId),
    enabled: !!token && !!companyId,
    refetchInterval: interval,
  });
}

/** One session with every step it took. */
export function useBrowserSession(companyId: number, agentId: number, sessionId: number | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['agent-browser-sessions', companyId, agentId, sessionId],
    queryFn: () => fetchBrowserSession(token!, companyId, agentId, sessionId!),
    enabled: !!token && !!companyId && sessionId !== null,
  });
}
