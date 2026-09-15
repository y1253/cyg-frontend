import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { generateWhatsApp } from '@/api/whatsapp';

/**
 * "Generate WhatsApp account". The response is the pending account, written straight
 * into the cache so the card switches to "waiting for the code" at once — and the
 * account query's own poll takes it from there to connected or failed.
 */
export function useGenerateWhatsApp(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateWhatsApp(token!, companyId),
    onSuccess: (account) => {
      qc.setQueryData(['whatsapp-account', companyId], account);
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
  });
}
