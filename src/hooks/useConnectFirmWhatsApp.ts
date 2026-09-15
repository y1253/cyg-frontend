import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { connectFirmWhatsApp } from '@/api/whatsapp';

/** Attach the firm's own WhatsApp number (server config) to a company. Admin only. */
export function useConnectFirmWhatsApp(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => connectFirmWhatsApp(token!, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-account', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
  });
}
