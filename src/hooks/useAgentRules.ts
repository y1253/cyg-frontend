import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAgentRules } from '@/api/agents';

/** `agentId: null` = the company's rules, read by every agent of the company. */
export function useAgentRules(companyId: number, agentId: number | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['agent-rules', companyId, agentId ?? 'company'],
    queryFn: () => fetchAgentRules(token!, companyId, agentId),
    enabled: !!token && !!companyId,
  });
}
