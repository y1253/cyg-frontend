import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCallRecordings, type CallRecordingsResult } from '@/api/phone';

/**
 * Recordings for one call, plus its AI summary. Fetched only when its detail view is open.
 *
 * The long `staleTime` still holds for the audio — a recording does not change once it
 * exists — but the summary DOES: it is generated in the background after the call ends,
 * so a call opened straight away arrives `pending`. Hence the poll, which stops the
 * moment the summary settles rather than running for the life of the open view.
 *
 * The recording itself can be late too: SignalWire files a long call's audio minutes
 * after it ends, so the server answers `pending` and this polls until it lands — and a
 * pending answer is never treated as fresh, or "no recording" would stick for 5 minutes.
 */
export function useCallRecordings(
  companyId: number,
  sid: string | null,
  parentCallSid?: string | null,
) {
  const { token } = useAuth();
  return useQuery<CallRecordingsResult>({
    queryKey: ['call-recordings', companyId, sid ?? '', parentCallSid ?? ''],
    queryFn: () =>
      fetchCallRecordings(token!, companyId, sid!, parentCallSid ?? null),
    enabled: !!token && !!companyId && !!sid,
    staleTime: (query) => (query.state.data?.pending ? 0 : 5 * 60_000),
    refetchInterval: (query) =>
      query.state.data?.pending ||
      query.state.data?.summary?.status === 'pending'
        ? 10_000
        : false,
  });
}
