import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchWhatsAppTemplates, isSendableTemplate } from '@/api/whatsapp';

/**
 * Every template on this company's WhatsApp account, in every review state.
 *
 * Long `staleTime` normally: templates change when somebody edits them in Business
 * Manager, which does not happen while a dialog is open.
 *
 * ── THE POLLING BACKSTOP ───────────────────────────────────────────────────────
 * ⚠️ While anything is NOT yet sendable, this re-checks every 20s — and that poll is not
 * a nicety, it is the primary way an approval is noticed. Meta's
 * `message_template_status_update` webhook would be faster, but whether it fires at all
 * is decided in the Meta App dashboard, and this account is currently subscribed to
 * `messages` ONLY (verified against the live app). Without the poll, a template somebody
 * submitted would sit looking pending forever while actually being approved and sendable.
 *
 * It stops the moment everything is sendable, so the steady state costs nothing.
 */
export function useWhatsAppTemplates(companyId: number, enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['whatsapp-templates', companyId],
    queryFn: () => fetchWhatsAppTemplates(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 5 * 60_000,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((t) => !isSendableTemplate(t))
        ? 20_000
        : false,
  });
}
