import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendSms } from '@/api/phone';
import { shrinkForMms } from '@/lib/image-shrink';

/**
 * Send a text from the company's support number.
 *
 * ⚠️ Pictures are shrunk HERE, in `mutationFn`, and not in the composers. Both the reply
 * thread and the new-message dialog route through this hook, so one call site covers
 * both and they cannot drift — the same reasoning `mergeAttachments` and its `allow`
 * predicate use. It also means the shrink happens when the file count is FINAL, which is
 * what the server's per-file budget is divided by.
 */
export function useSendSms(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      to,
      body,
      attachments,
    }: {
      to: string;
      body: string;
      attachments?: File[];
    }) =>
      sendSms(
        token!,
        companyId,
        to,
        body,
        await shrinkForMms(attachments ?? []),
      ),
    onSuccess: () => {
      // Both the conversation and the inbox row for it.
      void qc.invalidateQueries({ queryKey: ['sms-thread', companyId] });
      void qc.invalidateQueries({ queryKey: ['phone-timeline', companyId] });
      void qc.invalidateQueries({ queryKey: ['phone-counts', companyId] });
    },
  });
}
