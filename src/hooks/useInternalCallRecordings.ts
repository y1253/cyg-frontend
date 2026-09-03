import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchInternalCallRecordings,
  type InternalCallRecording,
} from '@/api/internalCalls';

export function useInternalCallRecordings(sid: string | null) {
  const { token } = useAuth();
  return useQuery<InternalCallRecording[]>({
    queryKey: ['internal-call-recordings', sid ?? ''],
    queryFn: () => fetchInternalCallRecordings(token!, sid!),
    enabled: !!token && !!sid,
    staleTime: 5 * 60 * 1000,
  });
}
