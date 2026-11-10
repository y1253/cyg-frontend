import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChannelFiles, type FileChannel, type FileDateRange } from '@/api/companyFiles';

/**
 * Every file from one of a company's conversation channels, newest first. Email and
 * WhatsApp page (`fetchNextPage`); chat and texts are crawled server-side in one go
 * (cached there for five minutes), so they come back as a single page.
 *
 * Mounted only by the Attachments folder, so nothing is asked while it is closed.
 * `range` (step2.md 2026-11-10) is in the key, so a new date range starts a fresh list
 * that pages through THAT range rather than through everything.
 */
export function useCompanyChannelFiles(
  companyId: number,
  channel: FileChannel,
  range: FileDateRange = {},
) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['company-channel-files', companyId, channel, range.from ?? '', range.to ?? ''],
    queryFn: ({ pageParam }) => fetchChannelFiles(token!, companyId, channel, pageParam, range),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextPageToken,
    enabled: !!token && !!companyId,
    staleTime: 60_000,
  });
}
