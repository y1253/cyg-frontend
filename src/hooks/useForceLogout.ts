import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { forceLogoutUser } from '../api/users';

/** Ends a user's session on whatever device holds it, freeing the account to sign in elsewhere. */
export function useForceLogout() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => forceLogoutUser(token!, id),
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
