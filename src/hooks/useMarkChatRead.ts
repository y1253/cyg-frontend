import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markChatRead } from '@/api/gmail';
import type { ChatListResult } from '@/api/gmail';

export function useMarkChatRead(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (spaceId: string) => markChatRead(token!, companyId, spaceId),
    onMutate: (spaceId: string) => {
      qc.setQueriesData<ChatListResult>(
        { queryKey: ['gmail-chats', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.spaceId === spaceId ? { ...c, isRead: true } : c,
            ),
          };
        },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
    },
  });
}
