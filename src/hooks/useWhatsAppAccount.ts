import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppAccount } from '@/api/whatsapp';

/** The WhatsApp number connected to a company, or null. */
export function useWhatsAppAccount(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['whatsapp-account', companyId],
    queryFn: () => fetchWhatsAppAccount(token!, companyId),
    enabled: !!token && !!companyId,
    staleTime: 60_000,
    retry: false,
  });
}
