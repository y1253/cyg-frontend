import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendInternalMessage } from '@/api/internalMessages';

type SendInput = Parameters<typeof sendInternalMessage>[1];

export function useSendInternalMessage() {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: SendInput) => sendInternalMessage(token!, data),
    onSuccess: () => {
      // The sender's own SENT list and any open thread need the new message; the
      // recipient learns about it over SSE rather than from here.
      //
      // Invalidate every thread rather than the sent message's own: a forward
      // roots a NEW conversation, so its threadId is not the thread the user is
      // looking at — but that thread now has to show the "You forwarded this
      // message" banner. Only the open thread is mounted, so this costs one refetch
      // however many compose windows are in flight.
      void qc.invalidateQueries({ queryKey: ['internal-messages'] });
      void qc.invalidateQueries({ queryKey: ['internal-message-thread'] });
    },
  });
}
