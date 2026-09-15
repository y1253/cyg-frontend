import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  markPhoneItem,
  type PhoneCounts,
  type PhoneStateAction,
  type PhoneTimelineResult,
} from '@/api/phone';
import type { InboxSummary } from '@/api/gmail';
import {
  dismissUnreadFeedItem,
  restoreUnreadFeedItem,
} from '@/lib/unreadFeedDismiss';

/**
 * Read / completed state for one call or text, optimistically applied.
 *
 * One hook covering four actions, rather than the four near-identical files the
 * mailbox has for each of email and chat. The patch is the only thing that differs
 * between them, so it is a parameter.
 */
export function useMarkPhoneItem(companyId: number, action: PhoneStateAction) {
  const { token } = useAuth();
  const qc = useQueryClient();

  const patch: Partial<{ isRead: boolean; isCompleted: boolean }> =
    action === 'read'
      ? { isRead: true }
      : action === 'unread'
        ? { isRead: false }
        : action === 'complete'
          ? { isCompleted: true }
          : { isCompleted: false };

  return useMutation({
    mutationFn: (itemId: string) =>
      markPhoneItem(token!, companyId, itemId, action),
    onMutate: (itemId: string) => {
      // `itemId` is already namespaced (`swcall:` / `swsms:`), which is exactly the id
      // the feed carries — so the bell row goes immediately, without a sweep. Only the
      // read actions touch it: completing something does not make it read.
      if (action === 'read') dismissUnreadFeedItem(itemId);
      if (action === 'unread') restoreUnreadFeedItem(itemId);

      // Read BEFORE the patch below, which is what makes "did it actually flip?"
      // answerable. Marking an already-read call read must not decrement anything.
      if (action === 'read' || action === 'unread') {
        applyMissedDelta(qc, companyId, missedDelta(qc, companyId, itemId, action));
      }

      qc.setQueriesData<InfiniteData<PhoneTimelineResult>>(
        { queryKey: ['phone-timeline', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((i) =>
                i.id === itemId ? { ...i, ...patch } : i,
              ),
            })),
          };
        },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['phone-timeline', companyId] });
      void qc.invalidateQueries({ queryKey: ['phone-counts', companyId] });
      // The dashboard's "missed calls" / "uncompleted" badges and the browser tab badge.
      // Safe to refetch straight away: the mark routes recount this company into the
      // server's 55s cache before responding (`refreshCompanyCounts`), and the bell rows
      // stay hidden through the dismiss store rather than through this cache.
      void qc.invalidateQueries({ queryKey: ['inbox-summary'] });
    },
  });
}

/**
 * -1 when this mark takes an unread missed call out of the count, +1 when it puts one
 * back, 0 for anything else — a text, an answered or outbound call, or a call already in
 * the requested state.
 *
 * The rule is `isUnreadMissedCall` minus its `isRead` clause, because `isRead` is the
 * thing changing.
 */
function missedDelta(
  qc: QueryClient,
  companyId: number,
  itemId: string,
  action: 'read' | 'unread',
): -1 | 0 | 1 {
  for (const [, data] of qc.getQueriesData<InfiniteData<PhoneTimelineResult>>({
    queryKey: ['phone-timeline', companyId],
  })) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((i) => i.id === itemId);
      if (!hit) continue;
      if (
        hit.kind !== 'call' ||
        hit.direction !== 'inbound' ||
        hit.outcome !== 'missed'
      ) {
        return 0;
      }
      if (action === 'read') return hit.isRead ? 0 : -1;
      return hit.isRead ? 1 : 0;
    }
  }
  return 0;
}

function applyMissedDelta(qc: QueryClient, companyId: number, delta: number) {
  if (delta === 0) return;
  qc.setQueriesData<PhoneCounts>(
    { queryKey: ['phone-counts', companyId] },
    (old) =>
      old && {
        ...old,
        missedUnread: Math.max(0, (old.missedUnread ?? 0) + delta),
      },
  );
  qc.setQueryData<InboxSummary>(['inbox-summary'], (old) => {
    const current = old?.missedCalls?.[companyId];
    // An absent key means UNKNOWN — inventing a number for it would be a guess.
    if (!old || current === undefined) return old;
    return {
      ...old,
      missedCalls: {
        ...old.missedCalls,
        [companyId]: Math.max(0, current + delta),
      },
    };
  });
}
