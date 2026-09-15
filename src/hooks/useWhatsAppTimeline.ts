import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppTimeline } from '@/api/whatsapp';

/**
 * The company's WhatsApp messages, keyset-paged newest first.
 *
 * Structurally `usePhoneTimeline`, with one difference: it is NOT gated on a connection.
 * The rows are ours (persisted from the webhook), so a disconnected company still shows
 * its history, and the request is a single indexed query on our own database rather than
 * a paid provider fan-out.
 */
export function useWhatsAppTimeline(companyId: number, active: boolean = true) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['whatsapp-timeline', companyId],
    queryFn: ({ pageParam }) => fetchWhatsAppTimeline(token!, companyId, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore ? (last.nextCursor ?? undefined) : undefined),
    enabled: !!token && !!companyId && active,
    refetchInterval: active ? 15000 : false,
    // Same reasons as usePhoneTimeline: under the poll, and loaded pages survive leaving
    // the tab for a while.
    staleTime: 10_000,
    gcTime: 30 * 60_000,
  });
}
