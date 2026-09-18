import { X } from 'lucide-react';
import type { WhatsAppSubmission } from '@/api/whatsapp';
import { MessageNotice } from '../MessageNotice';
import { templateSubmissionChrome } from './template-submission';

/**
 * The templates THIS company has submitted, pinned above the message list.
 *
 * ── WHY PINNED, AND NOT A ROW IN THE MERGED LIST ─────────────────────────────
 * The obvious reading of "show it as a message" is a row inside the inbox. It would
 * reintroduce the very bug this fixes. The merged list is clamped by a watermark
 * (`inbox-clamp.ts`): a source that cannot page pins with `-Infinity` and never constrains
 * the cutoff, but its own rows are still dropped unless `ts >= cutoff`. So a template
 * submitted three days ago, in an inbox whose email and phone sources have only paged back
 * to yesterday, would be FILTERED OUT — invisible again, and only on busy companies, which
 * is the worst possible way for it to fail.
 *
 * Pinning also keeps `ItemKind`, `UnifiedItem`, `Selection`, `stateMutations` and
 * `getItemTimestamp` untouched. That last one matters most: it is an exhaustive switch
 * whose failure mode is a silent `0`, which disables the clamp for the whole inbox.
 *
 * ⚠️ If a change here starts requiring edits to any of those files, this design has been
 * abandoned by accident — stop and re-read this comment.
 *
 * The honest trade: these rows do not time-sort and do not scroll away. For a bounded,
 * dismissible set of usually nought to two, that is the point rather than a cost.
 */
export function TemplateSubmissionRows({
  submissions,
  canManage,
  onDismiss,
  dismissing,
}: {
  submissions: readonly WhatsAppSubmission[];
  /** Only the management tier may clear a row; a USER can do nothing about a rejection. */
  canManage: boolean;
  onDismiss: (id: number) => void;
  /** The id currently being dismissed, so its button can show it is working. */
  dismissing?: number | null;
}) {
  if (submissions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 pt-3">
      {submissions.map((s) => {
        const { tone, Icon, label } = templateSubmissionChrome(s.status);
        return (
          <MessageNotice
            key={s.id}
            tone={tone}
            icon={<Icon size={14} className="shrink-0" />}
            action={
              canManage ? (
                <button
                  type="button"
                  title="Dismiss"
                  aria-label={`Dismiss template ${s.name}`}
                  disabled={dismissing === s.id}
                  onClick={() => onDismiss(s.id)}
                  className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
                >
                  <X size={14} />
                </button>
              ) : undefined
            }
          >
            <span className="min-w-0">
              <span className="font-medium">Template “{s.name}”</span>{' '}
              <span className="opacity-80">({s.language})</span> · {label}
              {s.rejectedReason && (
                // Meta's own words. Without them a rejection is unactionable.
                <span className="block text-xs opacity-90">
                  {s.rejectedReason}
                </span>
              )}
            </span>
          </MessageNotice>
        );
      })}
    </div>
  );
}
