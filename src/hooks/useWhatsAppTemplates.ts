import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppTemplates } from '@/api/whatsapp';

/**
 * The approved templates this company may send.
 *
 * Long `staleTime`: templates change when somebody edits them in Meta Business Manager,
 * which is not something that happens while a dialog is open, and the list is fetched on
 * every compose. `enabled` is the caller's, so the request is only made once the picker
 * is actually needed.
 */
export function useWhatsAppTemplates(companyId: number, enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['whatsapp-templates', companyId],
    queryFn: () => fetchWhatsAppTemplates(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 5 * 60_000,
  });
}
