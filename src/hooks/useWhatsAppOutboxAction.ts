import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { whatsAppOutboxAction } from '@/api/whatsapp';

/** Retry or discard a WhatsApp message that could not be sent. */
export function useWhatsAppOutboxAction(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'retry' | 'discard' }) =>
      whatsAppOutboxAction(token!, companyId, id, action),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', companyId] });
    },
  });
}
