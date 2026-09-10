import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { restoreUnreadFeedItem } from '@/lib/unreadFeedDismiss';
import { markEmailUnread } from '@/api/gmail';
import type { EmailListResult } from '@/api/gmail';

export function useMarkEmailUnread(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markEmailUnread(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      // Deliberately unread again, so it belongs back in the bell.
      restoreUnreadFeedItem(messageId);
      qc.setQueriesData<InfiniteData<EmailListResult>>(
        { queryKey: ['gmail-emails', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === messageId ? { ...m, isRead: false } : m,
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
