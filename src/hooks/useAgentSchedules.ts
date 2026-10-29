import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAgentSchedules } from '@/api/agents';

export function useAgentSchedules(companyId: number, agentId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['agent-schedules', companyId, agentId],
    queryFn: () => fetchAgentSchedules(token!, companyId, agentId),
    enabled: !!token && !!companyId,
  });
}
