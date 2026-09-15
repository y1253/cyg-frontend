import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendWhatsAppVoice } from '@/api/whatsapp';

/** Send a recorded voice note. `uploadProgress` is 0..1 while the upload runs, else null. */
export function useSendWhatsAppVoice(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({ to, recording, filename }: { to: string; recording: Blob; filename: string }) => {
      setUploadProgress(0);
      return sendWhatsAppVoice(token!, companyId, to, recording, filename, setUploadProgress);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
    },
    onSettled: () => setUploadProgress(null),
  });

  return { ...mutation, uploadProgress };
}
