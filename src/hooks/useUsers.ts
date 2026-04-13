import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { fetchUsers } from '../api/users';
import type { AppUser } from '../api/users';

export function useUsers() {
  const { token } = useAuth();
  return useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: () => fetchUsers(token!),
    enabled: !!token,
  });
}
