import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateAiModelPrice, type AiModelPriceInput } from '@/api/aiCosts';

/** step12: an admin's price for a model — it also prices that model's unpriced calls. */
export function useUpdateAiModelPrice() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: AiModelPriceInput }) => updateAiModelPrice(token!, id, input),
    // Every total may change (unpriced calls get a price).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ai-costs'] });
      void qc.invalidateQueries({ queryKey: ['costs'] });
    },
  });
}
