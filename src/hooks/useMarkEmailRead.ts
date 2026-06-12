import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markEmailRead } from '@/api/gmail';
import type { EmailListResult } from '@/api/gmail';

export function useMarkEmailRead(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markEmailRead(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      qc.setQueriesData<EmailListResult>(
        { queryKey: ['gmail-emails', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === messageId ? { ...m, isRead: true } : m,
            ),
          };
        },
      );
      void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
    },
  });
}
