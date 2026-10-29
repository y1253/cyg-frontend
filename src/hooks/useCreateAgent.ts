import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { createAgent, type AgentInput } from '@/api/agents';

export function useCreateAgent(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AgentInput) => createAgent(token!, companyId, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['agents', companyId] }),
  });
}
