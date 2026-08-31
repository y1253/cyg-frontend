import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markPhoneItem, type PhoneStateAction, type PhoneTimelineResult } from '@/api/phone';

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
    },
  });
}
