import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendWhatsAppText } from '@/api/whatsapp';

/** Send a WhatsApp text from the company's connected number. */
export function useSendWhatsApp(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      to,
      body,
      replyToMessageId,
    }: {
      to: string;
      body: string;
      replyToMessageId?: number;
    }) => sendWhatsAppText(token!, companyId, to, body, replyToMessageId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
  });
}
