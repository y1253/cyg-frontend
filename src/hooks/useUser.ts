import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchUser } from '@/api/users';
import type { AppUserDetail } from '@/api/users';

export function useUser(id: number) {
  const { token } = useAuth();
  return useQuery<AppUserDetail>({
    queryKey: ['user', id],
    queryFn: () => fetchUser(token!, id),
    enabled: !!token && !!id,
  });
}
