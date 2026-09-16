import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendWhatsAppMedia } from '@/api/whatsapp';

/**
 * Send one attached file. `uploadProgress` is 0..1 while the upload runs, else null.
 *
 * Mirrors `useSendWhatsAppVoice` exactly — the only difference is what is being uploaded,
 * and a document can be far larger, which is what makes the progress bar load-bearing
 * rather than decorative.
 */
export function useSendWhatsAppMedia(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({
      to,
      file,
      caption,
      replyToMessageId,
    }: {
      to: string;
      file: File;
      caption?: string;
      replyToMessageId?: number;
    }) => {
      setUploadProgress(0);
      return sendWhatsAppMedia(
        token!,
        companyId,
        to,
        file,
        { caption, replyToMessageId },
        setUploadProgress,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
    onSettled: () => setUploadProgress(null),
  });

  return { ...mutation, uploadProgress };
}
