import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignCompanyUsers, type AssignedUser, type CompanyDetail } from '@/api/companies';
import { useAuth } from '@/context/AuthContext';

/**
 * Sets a company's assignees to exactly `users`. The detail page updates at once
 * (optimistic) and rolls back if the server refuses.
 */
export function useAssignCompany() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, users }: { companyId: number; users: AssignedUser[] }) =>
      assignCompanyUsers(token!, companyId, users.map((u) => u.id)),
    onMutate: async ({ companyId, users }) => {
      const key = ['company', companyId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CompanyDetail>(key);
      if (previous) {
        queryClient.setQueryData<CompanyDetail>(key, {
          ...previous,
          assignedUsers: users,
          assignedUser: users[0] ?? null,
        });
      }
      return { previous };
    },
    onError: (_err, { companyId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['company', companyId], ctx.previous);
    },
    onSettled: (_data, _err, { companyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      void queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}
