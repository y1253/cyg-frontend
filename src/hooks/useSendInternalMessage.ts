import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendInternalMessage } from '@/api/internalMessages';

// `onProgress` is wired by this hook, not by callers — they read `uploadProgress`.
type SendInput = Omit<Parameters<typeof sendInternalMessage>[1], 'onProgress'>;

export function useSendInternalMessage() {
  const { token } = useAuth();
  const qc = useQueryClient();

  // Fraction 0–1 while attachment bytes are on the wire, null otherwise. With a
  // 250 MB per-file cap a send can take minutes, so the composer needs something
  // better than a spinner to show.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const onProgress = useCallback((fraction: number) => {
    // Clamp at 0.99: the last event fires when the bytes have left the browser,
    // but the server still has to write them and commit the message.
    setUploadProgress(Math.min(fraction, 0.99));
  }, []);

  const mutation = useMutation({
    mutationFn: (data: SendInput) => {
      setUploadProgress(data.files?.length ? 0 : null);
      return sendInternalMessage(token!, { ...data, onProgress });
    },
    onSettled: () => setUploadProgress(null),
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

  return { ...mutation, uploadProgress };
}
