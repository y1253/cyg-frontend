import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  completeUntil,
  type CompleteUntilTarget,
} from '@/api/completeUntil';

/**
 * "Complete till here", for any of the five conversation types.
 *
 * One hook rather than five, because the difference between the channels is entirely in
 * the anchor — which the caller already holds — while everything after the request is the
 * same: refresh the conversation, the list it came from, and the badges built on it.
 *
 * Deliberately NOT optimistic. The per-item mark hooks patch their caches because they
 * know exactly which row changes; here the server decides how many rows it touched (it can
 * see messages older than the client's capped view, and it skips rows already complete), so
 * guessing would put a number on screen that the next refetch contradicts.
 */
export function useCompleteUntil() {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (target: CompleteUntilTarget) => completeUntil(token!, target),
    onSettled: (_data, _err, target) => {
      // The badges every channel feeds, whichever one this was.
      void qc.invalidateQueries({ queryKey: ['inbox-summary'] });

      if (target.kind === 'internal') {
        void qc.invalidateQueries({ queryKey: ['internal-messages'] });
        void qc.invalidateQueries({ queryKey: ['internal-message-thread'] });
        void qc.invalidateQueries({ queryKey: ['internal-uncompleted-count'] });
        return;
      }

      const { companyId } = target;
      switch (target.kind) {
        case 'email':
          void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
          void qc.invalidateQueries({ queryKey: ['gmail-thread', companyId] });
          void qc.invalidateQueries({
            queryKey: ['gmail-uncompleted-count', companyId],
          });
          break;
        case 'chat':
          void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] });
          void qc.invalidateQueries({
            queryKey: ['gmail-chat-thread', companyId],
          });
          void qc.invalidateQueries({
            queryKey: ['gmail-uncompleted-count', companyId],
          });
          break;
        case 'sms':
          void qc.invalidateQueries({ queryKey: ['sms-thread', companyId] });
          void qc.invalidateQueries({
            queryKey: ['phone-timeline', companyId],
          });
          void qc.invalidateQueries({ queryKey: ['phone-counts', companyId] });
          break;
        case 'whatsapp':
          void qc.invalidateQueries({
            queryKey: ['whatsapp-thread', companyId],
          });
          void qc.invalidateQueries({
            queryKey: ['whatsapp-timeline', companyId],
          });
          void qc.invalidateQueries({
            queryKey: ['whatsapp-counts', companyId],
          });
          break;
      }
    },
  });
}
