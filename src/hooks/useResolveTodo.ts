import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resolveTodo } from '@/api/todos';
import { useAuth } from '@/context/AuthContext';

export function useResolveTodo(companyId: number) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todoId: number) => resolveTodo(token!, todoId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
