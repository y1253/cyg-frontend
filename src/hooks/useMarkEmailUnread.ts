import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markEmailUnread } from '@/api/gmail';
import type { EmailListResult } from '@/api/gmail';

export function useMarkEmailUnread(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markEmailUnread(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      qc.setQueriesData<EmailListResult>(
        { queryKey: ['gmail-emails', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === messageId ? { ...m, isRead: false } : m,
            ),
          };
        },
      );
      void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
      void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
    },
  });
}
