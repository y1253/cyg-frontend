import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchMyProfile } from '@/api/users';
import type { AppUserDetail } from '@/api/users';

/**
 * The signed-in user's own profile.
 *
 * Its own key rather than `['user', user.id]`: that key is the ADMIN detail page's, fed by
 * `GET /users/:id`, which a plain USER cannot call at all. Sharing it would make an
 * invalidation from the admin list fire a request that 403s for most of the staff.
 *
 * `AuthContext` is deliberately not the source. Its `AuthUser` carries no `phoneE164`, it
 * is hydrated from localStorage, and nothing in the app ever re-fetches it — so the page
 * owns its own query and the header keeps rendering the name it always did.
 */
export function useMyProfile() {
  const { token } = useAuth();
  return useQuery<AppUserDetail>({
    queryKey: ['me'],
    queryFn: () => fetchMyProfile(token!),
    enabled: !!token,
  });
}
