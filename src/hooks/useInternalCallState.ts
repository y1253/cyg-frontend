import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { setInternalCallState } from '@/api/internalCalls';
import {
  dismissUnreadFeedItem,
  restoreUnreadFeedItem,
} from '@/lib/unreadFeedDismiss';
import type {
  InternalCallListResult,
  InternalCallStateAction,
} from '@/api/internalCalls';

/** What each action changes on the cached row, applied optimistically. */
const PATCH: Record<
  InternalCallStateAction,
  { isRead?: boolean; isCompleted?: boolean }
> = {
  read: { isRead: true },
  unread: { isRead: false },
  complete: { isCompleted: true },
  uncomplete: { isCompleted: false },
};

/**
 * Read / unread / complete / uncomplete for one staff-to-staff call.
 *
 * The call-side twin of `useInternalMessageState`, and deliberately the same shape: patch
 * every cached page immediately so the row responds instantly, roll back by invalidating
 * on error, and refresh the badge counts once the request settles. The un-keyed
 * `['internal-calls']` prefix matches every folder at once, so a call marked read in
 * INBOX also leaves the UNREAD list.
 */
export function useInternalCallState() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { suppressSource } = useNotifications();

  return useMutation({
    mutationFn: ({
      sid,
      action,
    }: {
      sid: string;
      action: InternalCallStateAction;
    }) => setInternalCallState(token!, sid, action),
    onMutate: ({ sid, action }) => {
      // Marking unread raises the very count the notifier watches, and `onSettled`
      // force-refetches it — so without this the user's own click chimes at them.
      // Stamped before the request, not after, because the refetch can land first.
      if (action === 'unread') suppressSource('internal');

      // `intcall:{sid}` — the id the feed carries, namespaced so a call sid can never
      // collide with a numeric internal message id.
      if (action === 'read') dismissUnreadFeedItem(`intcall:${sid}`);
      if (action === 'unread') restoreUnreadFeedItem(`intcall:${sid}`);

      const patch = PATCH[action];
      qc.setQueriesData<InfiniteData<InternalCallListResult>>(
        { queryKey: ['internal-calls'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              calls: page.calls.map((c) =>
                c.sid === sid ? { ...c, ...patch } : c,
              ),
            })),
          };
        },
      );
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['internal-calls'] });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['internal-call-counts'] });
      // Keeps the dashboard "N uncompleted" badge honest without a full refetch cycle.
      void qc.invalidateQueries({ queryKey: ['inbox-summary'] });
    },
  });
}
