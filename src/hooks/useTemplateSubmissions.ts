import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchTemplateSubmissions,
  isSettledTemplateStatus,
  type WhatsAppSubmission,
} from '@/api/whatsapp';

/**
 * This company's own template submissions, for the strip above the inbox.
 *
 * ── WHY THIS EXISTS RATHER THAN `useWhatsAppTemplates` ────────────────────────
 * That hook lives inside the picker, which lives inside a dialog and a thread view —
 * both of which close. Closing them unmounted the query and STOPPED the status poll, so
 * a submitted template's verdict was never seen. This one is mounted with the inbox, so
 * the poll survives the dialog being closed, the page being reloaded and the user going
 * somewhere else and coming back.
 *
 * ⚠️ The stop condition is `isSettledTemplateStatus`, the same rule the server uses to
 * decide whether to spend a Graph call — so an idle firm costs nothing on either side.
 */
export function useTemplateSubmissions(companyId: number, enabled = true) {
  const { token } = useAuth();
  return useQuery<WhatsAppSubmission[]>({
    queryKey: ['whatsapp-template-submissions', companyId],
    queryFn: () => fetchTemplateSubmissions(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    // Matches `useWhatsAppTemplates`: poll only while Meta is still deciding.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => !isSettledTemplateStatus(s.status))
        ? 20_000
        : false,
  });
}
