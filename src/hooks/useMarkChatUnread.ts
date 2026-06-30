import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markChatUnread } from '@/api/gmail';
import type { ChatListResult } from '@/api/gmail';

export function useMarkChatUnread(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markChatUnread(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      qc.setQueriesData<ChatListResult>(
        { queryKey: ['gmail-chats', companyId] },
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
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
      void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
    },
  });
}
