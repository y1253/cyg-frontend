import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChannelFiles, type FileChannel } from '@/api/companyFiles';

/**
 * Every file from one of a company's conversation channels, newest first. Email and
 * WhatsApp page (`fetchNextPage`); chat and texts are crawled server-side in one go
 * (cached there for five minutes), so they come back as a single page.
 *
 * Mounted only by the Attachments folder, so nothing is asked while it is closed.
 */
export function useCompanyChannelFiles(companyId: number, channel: FileChannel) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['company-channel-files', companyId, channel],
    queryFn: ({ pageParam }) => fetchChannelFiles(token!, companyId, channel, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextPageToken,
    enabled: !!token && !!companyId,
    staleTime: 60_000,
  });
}
