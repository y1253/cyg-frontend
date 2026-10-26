import { useQuery } from '@tanstack/react-query';
import { fetchProspectMessages, fetchProspects } from '@/api/prospects';
import { useAuth } from '@/context/AuthContext';

const KEY = ['prospects'] as const;

/** step12f: phones with no account the AI salesperson talked to. ADMIN only. */
export function useProspects() {
  const { token } = useAuth();
  return useQuery({ queryKey: KEY, queryFn: () => fetchProspects(token!), enabled: !!token, refetchInterval: 60_000 });
}

/** One prospect's whole conversation (texts and calls), oldest first. */
export function useProspectMessages(id: number | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, id, 'messages'],
    queryFn: () => fetchProspectMessages(token!, id!),
    enabled: !!token && id !== null,
  });
}
