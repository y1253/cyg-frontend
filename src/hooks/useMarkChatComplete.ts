import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markChatComplete } from '@/api/gmail';
import type { ChatListResult } from '@/api/gmail';

export function useMarkChatComplete(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markChatComplete(token!, companyId, messageId),
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
                m.id === messageId ? { ...m, isCompleted: true } : m,
              ),
            })),
          };
        },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
    },
  });
}
