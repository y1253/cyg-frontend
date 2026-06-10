import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { disconnectGmail } from '@/api/gmail';

export function useDisconnectGmail(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectGmail(token!, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-account', companyId] });
      void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
    },
  });
}
