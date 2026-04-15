import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignCompanyUser } from '@/api/companies';
import { useAuth } from '@/context/AuthContext';

export function useAssignCompany() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, userId }: { companyId: number; userId: number | null }) =>
      assignCompanyUser(token!, companyId, userId),
    onSuccess: (_data, { companyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      void queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}
