import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { markChatUncomplete } from '@/api/gmail';
import type { ChatListResult } from '@/api/gmail';

export function useMarkChatUncomplete(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { suppressSource } = useNotifications();

  return useMutation({
    mutationFn: (messageId: string) => markChatUncomplete(token!, companyId, messageId),
    onMutate: (messageId: string) => {
      // See useMarkEmailUncomplete: the count this raises is the one the poll reads
      // as "new message", so mute the company rather than chime at the user's click.
      suppressSource(`company:${companyId}`);

      qc.setQueriesData<InfiniteData<ChatListResult>>(
        { queryKey: ['gmail-chats', companyId] },
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
      void qc.invalidateQueries({ queryKey: ['gmail-uncompleted-count', companyId] });
    },
  });
}
