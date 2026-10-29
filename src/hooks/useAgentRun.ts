import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAgentRun } from '@/api/agents';

/** One run of the work log, with its whole transcript. */
export function useAgentRun(companyId: number, agentId: number, runId: number | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['agent-activity', companyId, agentId, runId],
    queryFn: () => fetchAgentRun(token!, companyId, agentId, runId!),
    enabled: !!token && !!companyId && runId !== null,
  });
}
