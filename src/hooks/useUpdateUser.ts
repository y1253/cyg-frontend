import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { updateUser } from '../api/users';
import type { UpdateUserData } from '../api/users';

export function useUpdateUser() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserData }) =>
      updateUser(token!, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
