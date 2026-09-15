import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { disconnectWhatsApp } from '@/api/whatsapp';

/** Remove a company's WhatsApp connection. Message history is kept on the server. */
export function useDisconnectWhatsApp(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectWhatsApp(token!, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-account', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', companyId] });
    },
  });
}
