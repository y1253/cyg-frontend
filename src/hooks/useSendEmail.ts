import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendEmail } from '@/api/gmail';

export function useSendEmail(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { to: string; subject: string; body: string }) =>
      sendEmail(token!, companyId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
    },
  });
}
