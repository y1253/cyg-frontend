import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markChatRead, markEmailRead, type UnreadFeedItem } from '@/api/gmail';
import { markPhoneItem } from '@/api/phone';
import { setInternalMessageState } from '@/api/internalMessages';
import { setInternalCallState } from '@/api/internalCalls';
import {
  dismissUnreadFeedItem,
  restoreUnreadFeedItem,
} from '@/lib/unreadFeedDismiss';

/**
 * Mark one notification row read, from the bell, for any company.
 *
 * The per-channel hooks (`useMarkEmailRead` and friends) cannot serve this: they bind a
 * `companyId` at mount, and a row's company is only known when it is clicked. So this
 * calls the same endpoints they do and dispatches on the row's own `(scope, kind)`.
 *
 * Dismissal is optimistic and rolled back on failure, matching those hooks — and for the
 * same reason they patch their caches rather than invalidating: the server holds each
 * company's sweep for 55s, so a refetch now would hand the row straight back.
 */
export function useMarkFeedItemRead() {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (item: UnreadFeedItem) => send(token!, item),
    onMutate: (item: UnreadFeedItem) => {
      dismissUnreadFeedItem(item.id);
    },
    onError: (_err, item) => {
      // The request failed, so the message really is still unread. Leaving it hidden
      // would quietly drop it off the only surface that was showing it.
      restoreUnreadFeedItem(item.id);
    },
    onSettled: (_data, _err, item) => {
      // Keep whatever view of this company is open in step. The feed itself is already
      // correct via the dismissal, so it is deliberately NOT invalidated here.
      if (item.scope === 'internal') {
        void qc.invalidateQueries({ queryKey: ['internal-messages'] });
        void qc.invalidateQueries({ queryKey: ['internal-calls'] });
        void qc.invalidateQueries({ queryKey: ['internal-unread-count'] });
        return;
      }
      switch (item.kind) {
        case 'email':
          void qc.invalidateQueries({ queryKey: ['gmail-emails', item.companyId] });
          void qc.invalidateQueries({
            queryKey: ['gmail-unread-count', item.companyId],
          });
          break;
        case 'chat':
          void qc.invalidateQueries({ queryKey: ['gmail-chats', item.companyId] });
          void qc.invalidateQueries({
            queryKey: ['gmail-unread-count', item.companyId],
          });
          break;
        case 'call':
        case 'sms':
          void qc.invalidateQueries({
            queryKey: ['phone-timeline', item.companyId],
          });
          void qc.invalidateQueries({ queryKey: ['phone-counts', item.companyId] });
          break;
      }
    },
  });
}

function send(token: string, item: UnreadFeedItem): Promise<void> {
  if (item.scope === 'internal') {
    return item.kind === 'message'
      ? setInternalMessageState(token, item.messageId, 'read')
      : setInternalCallState(token, item.sid, 'read');
  }
  switch (item.kind) {
    case 'email':
      return markEmailRead(token, item.companyId, item.msgId);
    case 'chat':
      return markChatRead(token, item.companyId, item.msgId);
    case 'call':
      // `itemId`, never `sid` — the read-state tables are keyed by the namespaced id.
      return markPhoneItem(token, item.companyId, item.itemId, 'read');
    case 'sms':
      return markPhoneItem(token, item.companyId, item.msgId, 'read');
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}
