import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { dismissUnreadFeedItem } from '@/lib/unreadFeedDismiss';
import { markChatRead } from '@/api/gmail';
import type { ChatListResult } from '@/api/gmail';

export function useMarkChatRead(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markChatRead(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      // Chat read state is SHARED across staff (ChatMessageReadState is keyed by
      // company + message, not by user), so this row leaves everyone's bell on the next
      // sweep. That is the existing mailbox semantic, not a bug in the feed.
      dismissUnreadFeedItem(messageId);
      qc.setQueriesData<InfiniteData<ChatListResult>>(
        { queryKey: ['gmail-chats', companyId] },
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
      void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
    },
  });
}
