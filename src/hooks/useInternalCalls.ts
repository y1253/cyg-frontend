import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchInternalCallCounts,
  fetchInternalCalls,
  type InternalCallFolder,
} from '@/api/internalCalls';

/**
 * This user's staff-to-staff call history, one keyset page at a time.
 *
 * An INFINITE query, not a plain one, because the workspace inbox merges it with the
 * message stream under a watermark clamp — and the clamp is only honest if each source
 * can say whether it has more. A source that silently stopped at its first 50 rows would
 * drop older calls out of the merged list with nothing to indicate it.
 *
 * Polls only while the tab is on screen, matching the internal-messages convention — a
 * call that just ended is finalised lazily server-side, so a refetch is what fills in its
 * duration.
 */
export function useInternalCalls(
  folder: InternalCallFolder,
  active: boolean,
) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['internal-calls', folder],
    queryFn: ({ pageParam }) => fetchInternalCalls(token!, folder, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!token && active,
    refetchInterval: active ? 15000 : false,
  });
}

/**
 * Unread / uncompleted call totals for the folder chips.
 *
 * Summed with the message counts rather than replacing them — the same way
 * `CommunicationsTab` adds the phone contribution onto the mailbox's.
 */
export function useInternalCallCounts(active: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['internal-call-counts'],
    queryFn: () => fetchInternalCallCounts(token!),
    enabled: !!token && active,
    refetchInterval: active ? 30000 : false,
  });
}
