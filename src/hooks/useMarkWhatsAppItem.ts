import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  markWhatsAppItem,
  whatsappMessageIdOf,
  type WhatsAppStateAction,
  type WhatsAppTimelineResult,
} from '@/api/whatsapp';
import { dismissUnreadFeedItem, restoreUnreadFeedItem } from '@/lib/unreadFeedDismiss';

/**
 * Read / completed state for one WhatsApp message, optimistically applied — the
 * `useMarkPhoneItem` shape. Takes the inbox id (`wa:{id}`), which is also exactly the id
 * the bell carries, so the feed row goes immediately.
 */
export function useMarkWhatsAppItem(companyId: number, action: WhatsAppStateAction) {
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
      markWhatsAppItem(token!, companyId, whatsappMessageIdOf(itemId), action),
    onMutate: (itemId: string) => {
      if (action === 'read') dismissUnreadFeedItem(itemId);
      if (action === 'unread') restoreUnreadFeedItem(itemId);
      qc.setQueriesData<InfiniteData<WhatsAppTimelineResult>>(
        { queryKey: ['whatsapp-timeline', companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
            })),
          };
        },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-timeline', companyId] });
      void qc.invalidateQueries({ queryKey: ['whatsapp-counts', companyId] });
    },
  });
}
