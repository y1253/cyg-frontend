import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchUserDirectory } from '@/api/internalMessages';

/**
 * Staff list for the recipient autocomplete. Fetched only while composing and
 * cached generously — the roster changes far less often than a compose session.
 * Mirrors useGmailContacts' caching posture.
 */
export function useUserDirectory(enabled: boolean = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['user-directory'],
    queryFn: () => fetchUserDirectory(token!),
    enabled: !!token && enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
