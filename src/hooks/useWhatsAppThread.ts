import { useBackstop } from '@/lib/realtime-status';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppThread } from '@/api/whatsapp';

/** One WhatsApp conversation, oldest first, plus whether a reply may be sent. */
export function useWhatsAppThread(companyId: number, peer: string | null, active: boolean = true) {
  const { token } = useAuth();
  // The realtime channel announces changes; this poll is only the backstop.
  const pollMs = useBackstop(15000);
  return useQuery({
    queryKey: ['whatsapp-thread', companyId, peer ?? ''],
    queryFn: () => fetchWhatsAppThread(token!, companyId, peer!),
    enabled: !!token && !!companyId && !!peer,
    // A reply — and a voice note finishing its download — appears without a refresh,
    // but only while somebody is looking.
    refetchInterval: active ? pollMs : false,
  });
}
