import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAgentLearnings } from '@/api/agents';

/** What one agent wrote down for itself (step11), newest first. */
export function useAgentLearnings(companyId: number, agentId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['agent-learnings', companyId, agentId],
    queryFn: () => fetchAgentLearnings(token!, companyId, agentId),
    enabled: !!token && !!companyId,
  });
}
