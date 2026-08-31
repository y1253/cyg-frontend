import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendSms } from '@/api/phone';

/** Send a text from the company's support number. */
export function useSendSms(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ to, body }: { to: string; body: string }) =>
      sendSms(token!, companyId, to, body),
    onSuccess: () => {
      // Both the conversation and the inbox row for it.
      void qc.invalidateQueries({ queryKey: ['sms-thread', companyId] });
      void qc.invalidateQueries({ queryKey: ['phone-timeline', companyId] });
      void qc.invalidateQueries({ queryKey: ['phone-counts', companyId] });
    },
  });
}
