import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendInternalMessage } from '@/api/internalMessages';

type SendInput = Parameters<typeof sendInternalMessage>[1];

export function useSendInternalMessage() {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: SendInput) => sendInternalMessage(token!, data),
    onSuccess: (message) => {
      // The sender's own SENT list and any open thread need the new message; the
      // recipient learns about it over SSE rather than from here.
      void qc.invalidateQueries({ queryKey: ['internal-messages'] });
      void qc.invalidateQueries({
        queryKey: ['internal-message-thread', message.threadId],
      });
    },
  });
}
