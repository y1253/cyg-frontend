import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { setInternalMessageState } from '@/api/internalMessages';
import type {
  InternalListResult,
  InternalStateAction,
  InternalThreadResult,
} from '@/api/internalMessages';

/** What each action changes on the cached row, applied optimistically. */
const PATCH: Record<InternalStateAction, { isRead?: boolean; isCompleted?: boolean }> = {
  read: { isRead: true },
  unread: { isRead: false },
  complete: { isCompleted: true },
  uncomplete: { isCompleted: false },
};

/**
 * Read / unread / complete / uncomplete for a single message.
 *
 * Follows the optimistic `setQueriesData`-over-`InfiniteData` pattern established
 * by useMarkEmailRead: patch every cached page immediately so the row responds
 * instantly, roll back by invalidating on error, and refresh the badge counts once
 * the request settles. The un-keyed `['internal-messages']` prefix matches all
 * folders at once, so a message marked read in INBOX also leaves the UNREAD list.
 *
 * The open thread is patched too — its header button reads the message off
 * `['internal-message-thread']`, so without this it would keep the old label until
 * the 15s poll landed.
 */
export function useInternalMessageState() {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: InternalStateAction }) =>
      setInternalMessageState(token!, id, action),
    onMutate: ({ id, action }) => {
      const patch = PATCH[action];
      qc.setQueriesData<InfiniteData<InternalListResult>>(
        { queryKey: ['internal-messages'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === id ? { ...m, ...patch } : m,
              ),
            })),
          };
        },
      );
      qc.setQueriesData<InternalThreadResult>(
        { queryKey: ['internal-message-thread'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === id ? { ...m, ...patch } : m,
            ),
          };
        },
      );
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['internal-messages'] });
      void qc.invalidateQueries({ queryKey: ['internal-message-thread'] });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['internal-uncompleted-count'] });
      void qc.invalidateQueries({ queryKey: ['internal-unread-count'] });
      // Keeps the dashboard "N uncompleted" badge honest without a full refetch cycle.
      void qc.invalidateQueries({ queryKey: ['gmail-uncompleted-counts'] });
    },
  });
}
