import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAgentActivity } from '@/api/agents';
import { useBackstop } from '@/lib/realtime-status';

/** The agent's work log (its runs on the agents server), newest first. */
export function useAgentActivity(companyId: number, agentId: number) {
  const { token } = useAuth();
  const interval = useBackstop(15_000);
  return useQuery({
    queryKey: ['agent-activity', companyId, agentId],
    queryFn: () => fetchAgentActivity(token!, companyId, agentId),
    enabled: !!token && !!companyId,
    refetchInterval: interval,
  });
}
