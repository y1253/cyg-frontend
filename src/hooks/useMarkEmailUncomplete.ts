import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markEmailUncomplete } from '@/api/gmail';
import type { EmailListResult } from '@/api/gmail';

export function useMarkEmailUncomplete(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markEmailUncomplete(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      qc.setQueriesData<InfiniteData<EmailListResult>>(
        { queryKey: ['gmail-emails', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === messageId ? { ...m, isCompleted: false } : m,
              ),
            })),
          };
        },
      );
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
    },
  });
}
