import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateMyPhone } from '@/api/users';

/**
 * Save the caller's own cell number.
 *
 * ⚠️ INVALIDATES rather than writing the result into `['me']`. The server answers from
 * `USER_SELECT`, which carries no `companies`, so seeding the cache with it would blank
 * the profile's company list as a side effect of saving a phone number.
 *
 * `['users']` and `['user', id]` are invalidated too, so an admin who happens to have the
 * users list open in another tab does not sit on a stale number — the same reason
 * `useUpdateUser` refreshes both.
 */
export function useUpdateMyPhone() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (phoneE164: string | null) => updateMyPhone(token!, phoneE164),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['user', result.id] });
    },
  });
}
