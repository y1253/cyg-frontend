import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  markUntil,
  type CompleteUntilTarget,
  type UntilAction,
} from '@/api/completeUntil';
import { useNotifications } from '@/context/NotificationContext';

/**
 * "Complete till here" / "Read till here", for any of the five conversation types.
 *
 * One hook rather than ten, because the difference between the channels is entirely in
 * the anchor — which the caller already holds — while everything after the request is the
 * same: refresh the conversation, the list it came from, and the badges built on it. The
 * ACTION only picks the route; see `UntilAction` for why those are separate routes.
 *
 * Deliberately NOT optimistic. The per-item mark hooks patch their caches because they
 * know exactly which row changes; here the server decides how many rows it touched (it can
 * see messages older than the client's capped view, and it skips rows already in that
 * state), so guessing would put a number on screen that the next refetch contradicts.
 */
export function useMarkUntil(action: UntilAction = 'complete') {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { pushToast } = useNotifications();

  return useMutation({
    mutationFn: (target: CompleteUntilTarget) =>
      markUntil(token!, target, action),
    /**
     * ⚠️ THE reason this hook has an `onError` at all.
     *
     * It did not, and that is what hid a real bug for as long as it lived: the WhatsApp
     * thread sent `Number('wa:42')` — `NaN`, which serialises to `null` — the DTO's
     * `@IsInt()` rejected it with a 400, React Query swallowed the rejection, and the
     * dialog had ALREADY closed the thread on its way out. The user saw a plausible count,
     * then nothing changed, with no error anywhere to explain it.
     *
     * A silent failure on a bulk write is the worst kind: the whole point of "till here"
     * is that you stop checking the rows individually.
     */
    onError: (err: unknown) => {
      pushToast({
        title:
          action === 'read'
            ? 'Could not mark these read'
            : 'Could not complete these',
        body:
          err instanceof Error && err.message
            ? err.message
            : 'The messages were left unchanged.',
      });
    },
    onSettled: (_data, _err, target) => {
      // The badges every channel feeds, whichever one this was.
      void qc.invalidateQueries({ queryKey: ['inbox-summary'] });

      if (target.kind === 'internal') {
        void qc.invalidateQueries({ queryKey: ['internal-messages'] });
        void qc.invalidateQueries({ queryKey: ['internal-message-thread'] });
        void qc.invalidateQueries({ queryKey: ['internal-uncompleted-count'] });
        void qc.invalidateQueries({ queryKey: ['internal-unread-count'] });
        return;
      }

      const { companyId } = target;
      switch (target.kind) {
        // ⚠️ The `gmail-*` key names cover Microsoft too — the Outlook and Teams queries
        // reuse them rather than having a parallel set, so do not "fix" these to be
        // provider-specific without moving the queries as well.
        case 'email':
          void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
          void qc.invalidateQueries({ queryKey: ['gmail-thread', companyId] });
          void qc.invalidateQueries({
            queryKey: ['gmail-uncompleted-count', companyId],
          });
          void qc.invalidateQueries({
            queryKey: ['gmail-unread-count', companyId],
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
          void qc.invalidateQueries({
            queryKey: ['gmail-unread-count', companyId],
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
