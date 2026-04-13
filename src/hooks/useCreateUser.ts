import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { createUser } from '../api/users';
import type { CreateUserData } from '../api/users';

export function useCreateUser() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserData) => createUser(token!, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
