import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { deleteAgent } from '@/api/agents';

export function useDeleteAgent(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAgent(token!, companyId, id),
    onSettled: () => qc.invalidateQueries({ queryKey: ['agents', companyId] }),
  });
}
