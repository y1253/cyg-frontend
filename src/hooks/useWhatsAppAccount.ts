import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppAccount, isWhatsAppSettingUp } from '@/api/whatsapp';

/**
 * The WhatsApp number connected to a company, or null.
 *
 * Polls every 3s ONLY while a generated number is still verifying: the server finishes
 * setup on its own once Meta's text arrives, and nothing else would tell this card.
 */
export function useWhatsAppAccount(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['whatsapp-account', companyId],
    queryFn: () => fetchWhatsAppAccount(token!, companyId),
    enabled: !!token && !!companyId,
    staleTime: 60_000,
    retry: false,
    refetchInterval: (query) => (isWhatsAppSettingUp(query.state.data) ? 3000 : false),
  });
}
