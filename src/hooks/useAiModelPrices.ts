import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchAiModels } from '@/api/aiCosts';

/** step12: the OpenAI models the customer site has used, with their prices (ADMIN only). */
export function useAiModelPrices() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['ai-costs', 'models'],
    queryFn: () => fetchAiModels(token!),
    enabled: !!token,
  });
}
