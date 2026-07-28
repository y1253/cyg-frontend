import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchInternalMessage } from '@/api/internalMessages';

/** Single message detail (body + attachments). One-shot — no polling. */
export function useInternalMessage(id: number | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['internal-message', id],
    queryFn: () => fetchInternalMessage(token!, id!),
    enabled: !!token && !!id,
  });
}
