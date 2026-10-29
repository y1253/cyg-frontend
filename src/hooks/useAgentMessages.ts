import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAgentMessages } from '@/api/agents';
import { useBackstop } from '@/lib/realtime-status';

/**
 * One agent's chat with staff. Pushed by the realtime `agent-messages` topic (keyed by
 * company, so the prefix refreshes every chat of the company); the poll is the backstop.
 */
export function useAgentMessages(companyId: number, agentId: number | null) {
  const { token } = useAuth();
  const interval = useBackstop(10_000);
  return useQuery({
    queryKey: ['agent-messages', companyId, agentId],
    queryFn: () => fetchAgentMessages(token!, companyId, agentId!),
    enabled: !!token && !!companyId && agentId !== null,
    refetchInterval: interval,
  });
}
