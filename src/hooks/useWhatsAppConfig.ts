import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppConfig } from '@/api/whatsapp';

/** The Embedded Signup popup's public config. Changes only with a server env edit. */
export function useWhatsAppConfig(enabled: boolean = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () => fetchWhatsAppConfig(token!),
    enabled: !!token && enabled,
    staleTime: 10 * 60_000,
  });
}
