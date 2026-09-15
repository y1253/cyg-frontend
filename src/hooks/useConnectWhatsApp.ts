import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { connectWhatsApp } from '@/api/whatsapp';

/** Finish Embedded Signup for a company: the popup's code + ids go straight to the server. */
export function useConnectWhatsApp(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string; wabaId: string; phoneNumberId: string }) =>
      connectWhatsApp(token!, companyId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-account', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
  });
}
