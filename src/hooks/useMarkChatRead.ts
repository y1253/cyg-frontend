import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markChatRead } from '@/api/gmail';
import type { ChatListResult } from '@/api/gmail';

export function useMarkChatRead(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markChatRead(token!, companyId, messageId),
    onMutate: (messageId: string) => {
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
