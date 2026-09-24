import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAiConfig } from '@/api/ai';

/**
 * Which AI features are switched on for this firm.
 *
 * Long `staleTime`: these are env vars, so they change on a deploy, not during a session.
 * A failure resolves to everything OFF, which hides the controls — the safe direction,
 * since a visible control that cannot work is the failure this query exists to prevent.
 */
export function useAiConfig() {
  const { token } = useAuth();
  const { data } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => fetchAiConfig(token!),
    enabled: !!token,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  });
  return {
    assist: data?.assist ?? false,
    transcribeInbound: data?.transcribeInbound ?? false,
    dictationLive: data?.dictationLive ?? false,
  };
}
