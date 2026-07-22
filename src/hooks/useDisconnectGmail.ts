import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { disconnectGmail, clearCompanyProvider } from '@/api/gmail';

export function useDisconnectGmail(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectGmail(token!, companyId),
    onSuccess: () => {
      // Forget the connected provider and refetch every dependent query so the
      // UI flips back to the connect screen with a clean slate (no manual reload).
      clearCompanyProvider(companyId);
      for (const key of [
        ['gmail-account', companyId],
        ['gmail-emails', companyId],
        ['gmail-chats', companyId],
        ['gmail-unread-count', companyId],
        ['gmail-uncompleted-count', companyId],
        ['gmail-uncompleted-counts'],
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
