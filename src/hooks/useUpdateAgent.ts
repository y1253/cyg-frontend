import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateAgent, type AgentInput } from '@/api/agents';

/** Name, description and approval mode of one agent. */
export function useUpdateAgent(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<AgentInput> }) =>
      updateAgent(token!, companyId, id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['agents', companyId] }),
  });
}
