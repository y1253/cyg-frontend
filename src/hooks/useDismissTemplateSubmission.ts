import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { dismissTemplateSubmission } from '@/api/whatsapp';

/** Clear one submission off the inbox strip. The row is kept server-side as history. */
export function useDismissTemplateSubmission(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      dismissTemplateSubmission(token!, companyId, id),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['whatsapp-template-submissions', companyId],
      }),
  });
}
