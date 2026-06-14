import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendChatMessage } from '@/api/gmail';

export function useSendChatMessage(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceId, text }: { spaceId: string; text: string }) =>
      sendChatMessage(token!, companyId, spaceId, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
    },
  });
}
