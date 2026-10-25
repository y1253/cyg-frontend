import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateCommProvider, type CommProviderInput } from '@/api/commCosts';

/** step12d: an admin's prices for a provider — they also price its unpriced texts and calls. */
export function useUpdateCommProvider() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CommProviderInput }) => updateCommProvider(token!, id, input),
    // Every total may change (unpriced rows get a price).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['comm-costs'] });
      void qc.invalidateQueries({ queryKey: ['costs'] });
    },
  });
}
