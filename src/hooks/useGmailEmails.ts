import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmails } from '@/api/gmail';

export function useGmailEmails(
  companyId: number,
  labelId: string = 'INBOX',
  q?: string,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['gmail-emails', companyId, labelId, q ?? ''],
    queryFn: ({ pageParam }) => fetchEmails(token!, companyId, pageParam, labelId, q),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    // The Communications tab stays mounted while hidden (so an open message and any
    // draft survive a tab switch), so polling is gated on visibility rather than on
    // mount. Re-enabling refetches at once (staleTime is 0), so the list is fresh
    // the moment the user comes back.
    enabled: !!token && !!companyId && active,
    refetchInterval: active ? 15000 : false,
  });
}
