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
    onSuccess: (_result, { id }) => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      // ...and the detail page's own key. Previously only the list was refreshed, which
      // was invisible while nothing on /admin/users/:id could be edited; with a phone
      // number rendered there, an edit made from the list left a stale value on screen.
      void qc.invalidateQueries({ queryKey: ['user', id] });
    },
  });
}
