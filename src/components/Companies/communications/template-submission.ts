import { AlertCircle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react';
import type { NoticeTone } from '../MessageNotice';

/**
 * How one submitted template reads in the strip above the inbox.
 *
 * ⚠️ An exhaustive-by-default map with an explicit fallback rather than a `Record` over a
 * union: `status` arrives as a plain string from Meta's vocabulary, which they extend
 * without asking. An unknown value must render as "submitted, waiting" rather than throw
 * or render blank — the strip exists to reassure somebody that their submission was not
 * lost, and a blank row does the opposite.
 */
export interface SubmissionChrome {
  tone: NoticeTone;
  Icon: LucideIcon;
  label: string;
}

export function templateSubmissionChrome(status: string): SubmissionChrome {
  switch (status) {
    case 'APPROVED':
      return { tone: 'teal', Icon: CheckCircle2, label: 'approved — ready to send' };
    case 'REJECTED':
      return { tone: 'destructive', Icon: AlertCircle, label: 'rejected by Meta' };
    case 'PAUSED':
      return { tone: 'amber', Icon: AlertCircle, label: 'paused by Meta' };
    case 'DISABLED':
      return { tone: 'destructive', Icon: AlertCircle, label: 'disabled by Meta' };
    case 'IN_APPEAL':
      return { tone: 'amber', Icon: Clock, label: 'under appeal' };
    case 'PENDING_DELETION':
      return { tone: 'muted', Icon: Clock, label: 'being deleted' };
    case 'PENDING':
    default:
      return { tone: 'amber', Icon: Clock, label: 'waiting for Meta to review' };
  }
}
