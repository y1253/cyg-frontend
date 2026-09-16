import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendWhatsAppTemplate } from '@/api/whatsapp';

/**
 * Send an approved template. Same invalidations as `useSendWhatsApp` — a template send
 * produces an ordinary outbound row, and it is the one that OPENS a conversation, so the
 * timeline has a genuinely new thread to show.
 */
export function useSendWhatsAppTemplate(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      to: string;
      name: string;
      language: string;
      variables: string[];
    }) => sendWhatsAppTemplate(token!, companyId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
  });
}
