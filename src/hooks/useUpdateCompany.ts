import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateCompany } from '@/api/companies';

export function useUpdateCompany() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { supportNumber?: string } }) =>
      updateCompany(token!, id, data),
    onSuccess: (_result, { id }) => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      void qc.invalidateQueries({ queryKey: ['company', id] });
    },
  });
}
