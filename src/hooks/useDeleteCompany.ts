import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCompany } from '@/api/companies';
import { useAuth } from '@/context/AuthContext';

export function useDeleteCompany() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCompany(token!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
}
