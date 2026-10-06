import { useBackstop } from '@/lib/realtime-status';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppCounts } from '@/api/whatsapp';

/** Unread / uncompleted WhatsApp counts, folded into this company's folder badges. */
export function useWhatsAppCounts(companyId: number, active: boolean = true) {
  const { token } = useAuth();
  // The realtime channel announces changes; this poll is only the backstop.
  const pollMs = useBackstop(60000);
  return useQuery({
    queryKey: ['whatsapp-counts', companyId],
    queryFn: () => fetchWhatsAppCounts(token!, companyId),
    enabled: !!token && !!companyId && active,
    refetchInterval: active ? pollMs : false,
  });
}
