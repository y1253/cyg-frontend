import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { deleteUser } from '../api/users';

export function useDeleteUser() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteUser(token!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
