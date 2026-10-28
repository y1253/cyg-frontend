import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { createAgent } from '@/api/agents';

export function useCreateAgent(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createAgent(token!, companyId, name),
    onSettled: () => qc.invalidateQueries({ queryKey: ['agents', companyId] }),
  });
}
