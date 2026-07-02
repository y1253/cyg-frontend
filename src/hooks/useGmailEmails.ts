import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchEmails } from '@/api/gmail';

export function useGmailEmails(companyId: number, labelId: string = 'INBOX') {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['gmail-emails', companyId, labelId],
    queryFn: ({ pageParam }) => fetchEmails(token!, companyId, pageParam, labelId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    enabled: !!token && !!companyId,
    refetchInterval: 15000,
  });
}
