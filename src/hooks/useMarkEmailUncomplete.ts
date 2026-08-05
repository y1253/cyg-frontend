import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { markEmailUncomplete } from '@/api/gmail';
import type { EmailListResult } from '@/api/gmail';

export function useMarkEmailUncomplete(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { suppressSource } = useNotifications();

  return useMutation({
    mutationFn: (messageId: string) => markEmailUncomplete(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      // Uncompleting raises this company's uncompleted count, which is exactly the
      // rise the 60s poll reads as "new message". Mute the company for the
      // suppression window so the user isn't alerted by their own click — a bulk
      // uncomplete just re-stamps the same key.
      suppressSource(`company:${companyId}`);

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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-uncompleted-count', companyId] });
    },
  });
}
