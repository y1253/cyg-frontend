import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchInternalThread } from '@/api/internalMessages';

/**
 * Full conversation for the reading pane. Polls on the same 15s cadence as the
 * list so a reply arriving mid-read appears; `keepPreviousData` stops the pane
 * from flashing empty between refetches.
 */
export function useInternalMessageThread(
  threadId: number | null,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['internal-message-thread', threadId],
    queryFn: () => fetchInternalThread(token!, threadId!),
    enabled: !!token && !!threadId && active,
    refetchInterval: active ? 15000 : false,
    placeholderData: keepPreviousData,
  });
}
