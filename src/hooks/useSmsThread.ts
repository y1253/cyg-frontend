import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchSmsThread } from '@/api/phone';

/** The whole SMS conversation with one number, oldest first. */
export function useSmsThread(
  companyId: number,
  peer: string | null,
  active: boolean = true,
) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['sms-thread', companyId, peer ?? ''],
    queryFn: () => fetchSmsThread(token!, companyId, peer!),
    enabled: !!token && !!companyId && !!peer,
    // Matches the chat thread: a reply from the other side should appear without a
    // manual refresh, but only while the user is actually looking at it.
    refetchInterval: active ? 15000 : false,
  });
}
