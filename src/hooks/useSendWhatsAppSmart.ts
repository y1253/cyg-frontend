import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendWhatsAppSmart } from '@/api/whatsapp';

/**
 * Send what the user typed. Inside the 24-hour window it goes as a text; outside it the
 * server queues it and finds or creates a template, and the thread shows its progress.
 */
export function useSendWhatsAppSmart(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ to, text }: { to: string; text: string }) =>
      sendWhatsAppSmart(token!, companyId, to, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
  });
}
