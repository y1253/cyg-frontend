import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { dismissUnreadFeedItem } from '@/lib/unreadFeedDismiss';
import { markEmailRead } from '@/api/gmail';
import type { EmailListResult } from '@/api/gmail';

export function useMarkEmailRead(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markEmailRead(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      // Leaves the notification bell at once. Not an invalidation: the server caches
      // each company's sweep for 55s, so a refetch now would return this same message
      // and the row the user just read would flicker back.
      dismissUnreadFeedItem(messageId);
      qc.setQueriesData<InfiniteData<EmailListResult>>(
        { queryKey: ['gmail-emails', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === messageId ? { ...m, isRead: true } : m,
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
      void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
    },
  });
}
