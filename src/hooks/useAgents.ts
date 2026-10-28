import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAgents } from '@/api/agents';

/** A company's AI agents (the Agents tab). */
export function useAgents(companyId: number, enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['agents', companyId],
    queryFn: () => fetchAgents(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 30_000,
  });
}
