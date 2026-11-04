import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchInternalCallRecordings,
  type InternalCallRecordingsResult,
} from '@/api/internalCalls';

/**
 * Mirrors `useCallRecordings`, including the poll while a summary is still generating
 * and while the recording itself is still being filed (`pending`).
 */
export function useInternalCallRecordings(sid: string | null) {
  const { token } = useAuth();
  return useQuery<InternalCallRecordingsResult>({
    queryKey: ['internal-call-recordings', sid ?? ''],
    queryFn: () => fetchInternalCallRecordings(token!, sid!),
    enabled: !!token && !!sid,
    staleTime: (query) => (query.state.data?.pending ? 0 : 5 * 60 * 1000),
    refetchInterval: (query) =>
      query.state.data?.pending ||
      query.state.data?.summary?.status === 'pending'
        ? 10_000
        : false,
  });
}
