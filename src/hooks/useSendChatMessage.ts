import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendChatMessage } from '@/api/gmail';

export function useSendChatMessage(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      spaceId,
      text,
      quotedMessageName,
      quotedMessageLastUpdateTime,
    }: {
      spaceId: string;
      text: string;
      quotedMessageName?: string;
      quotedMessageLastUpdateTime?: string;
    }) =>
      sendChatMessage(
        token!,
        companyId,
        spaceId,
        text,
        quotedMessageName && quotedMessageLastUpdateTime
          ? { quotedMessageName, quotedMessageLastUpdateTime }
          : undefined,
      ),
    onSuccess: (_data, { spaceId }) => {
      void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
      // Refetch the open thread so the just-sent (quoted) reply appears.
      void qc.invalidateQueries({
        queryKey: ['gmail-chat-thread', companyId, spaceId],
      });
    },
  });
}
