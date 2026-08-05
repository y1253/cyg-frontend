import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendEmail } from '@/api/gmail';

export function useSendEmail(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  // Fraction 0–1 while attachment bytes are on the wire, null otherwise. With a
  // 250 MB per-file cap a send can take minutes, so the composer needs something
  // better than a spinner to show.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const onProgress = useCallback((fraction: number) => {
    // Clamp at 0.99: the last event fires when the bytes are sent, but the server
    // still has to upload them onward to Drive/OneDrive and send the message.
    setUploadProgress(Math.min(fraction, 0.99));
  }, []);

  const mutation = useMutation({
    mutationFn: (data: {
      to: string;
      subject: string;
      body: string;
      bodyHtml?: string;
      cc?: string;
      inReplyTo?: string;
      references?: string;
      threadId?: string;
      forwardedFrom?: string;
      replyToMessageId?: string;
      files?: File[];
    }) => {
      setUploadProgress(data.files?.length ? 0 : null);
      return sendEmail(token!, companyId, { ...data, onProgress });
    },
    onSettled: () => setUploadProgress(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
      // Refresh the open conversation so a just-sent reply shows immediately
      // (the 15s poll would otherwise be the only trigger).
      void qc.invalidateQueries({ queryKey: ['gmail-email-thread', companyId] });
    },
  });

  return { ...mutation, uploadProgress };
}
