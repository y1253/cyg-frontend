import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchInternalMessages } from '@/api/internalMessages';
import type { InternalFolder } from '@/api/internalMessages';

export function useInternalMessages(
  folder: InternalFolder,
  q?: string,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['internal-messages', folder, q ?? ''],
    queryFn: ({ pageParam }) =>
      fetchInternalMessages(token!, folder, pageParam, q),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Like the Communications tab, this stays mounted while hidden so an open
    // message and any draft survive a tab switch — polling is gated on visibility
    // rather than mount. SSE is the primary delivery path; this is the fallback.
    enabled: !!token && active,
    refetchInterval: active ? 15000 : false,
  });
}
