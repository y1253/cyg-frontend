import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchExtensionStatus } from '@/api/agents';

/** step2.md (2026-11-05): is my CYG Chrome extension connected (the Agents tab card)? */
export function useExtensionStatus(enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['extension-status'],
    queryFn: () => fetchExtensionStatus(token!),
    enabled: !!token && enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
}
