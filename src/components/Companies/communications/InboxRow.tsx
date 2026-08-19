import { CheckCircle2, Forward, MessageSquare, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { EmailSummary } from '@/api/gmail';
import { emailAttachmentUrl } from '@/api/gmail';
import { AttachmentChip } from '../AttachmentPreview';
import { displayName, formatEmailDate, senderInitial } from '../message-utils';
import type { UnifiedItem } from './types';

const MAX_CHIPS = 3;

/**
 * One row in the message list.
 *
 * This was written out three times: the email row and the chat row in the unified
 * inbox, and a third copy for the email-only folders (Sent/Spam/Trash) that was the
 * email row minus its checkbox and kind badge. They differ only in palette and in
 * which fields carry the sender/preview text, so both are derived from `item.kind`
 * and the extras are flags.
 */
export function InboxRow({
  item,
  isFirst,
  selectionMode,
  selected,
  showKindBadge,
  companyId,
  token,
  onOpen,
  onToggleSelect,
  onToggleRead,
  onToggleComplete,
}: {
  item: UnifiedItem;
  isFirst: boolean;
  selectionMode: boolean;
  selected: boolean;
  /** The unified inbox labels each row Email/Chat; a single-kind folder doesn't. */
  showKindBadge: boolean;
  companyId: number;
  token: string | null;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleRead: () => void;
  onToggleComplete: () => void;
}) {
  const isEmail = item.kind === 'email';
  const { isRead, isCompleted } = item.data;

  const hoverBg = isEmail
    ? !isRead ? 'bg-white hover:bg-blue-50/60' : 'bg-muted/10 hover:bg-muted/30'
    : !isRead ? 'bg-white hover:bg-purple-50/60' : 'bg-muted/10 hover:bg-purple-50/40';

  return (
    <div
      className={[
        'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer',
        isEmail ? 'group' : '',
        selectionMode && selected ? 'bg-teal-50/70 hover:bg-teal-50' : hoverBg,
        isFirst ? '' : 'border-t border-border/60',
      ].join(' ')}
      onClick={() => (selectionMode ? onToggleSelect() : onOpen())}
    >
      {/* Unread accent bar */}
      {!isRead && (
        <span
          className={[
            'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg',
            isEmail ? 'bg-teal-500' : 'bg-purple-500',
          ].join(' ')}
        />
      )}
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="mt-1 shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
        </div>
      )}
      {/* Read/unread toggle dot */}
      <button
        className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
        title={isRead ? 'Mark as unread' : 'Mark as read'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleRead();
        }}
      >
        <span
          className={[
            'w-2.5 h-2.5 rounded-full border-2 transition-colors',
            isRead
              ? 'bg-transparent border-muted-foreground/40'
              : isEmail ? 'bg-teal-500 border-teal-500' : 'bg-purple-500 border-purple-500',
          ].join(' ')}
        />
      </button>
      {/* Avatar */}
      <div
        className={[
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5',
          isEmail ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700',
        ].join(' ')}
      >
        {isEmail
          ? senderInitial(item.data.from)
          : (item.data.sender[0] ?? '?').toUpperCase()}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={[
              'text-sm truncate',
              isEmail ? '' : 'flex items-center gap-1.5',
              !isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
            ].join(' ')}
          >
            {isEmail ? (
              displayName(item.data.from)
            ) : (
              <>
                <MessageSquare size={11} className="text-purple-500 shrink-0" />
                {item.data.sender}
              </>
            )}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Small blue completed-check toggle. Not-complete → opens the confirm
                popup; already-complete → undoes directly (no confirm). */}
            <button
              className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
              title={isCompleted ? 'Completed — click to undo' : 'Mark complete'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleComplete();
              }}
            >
              <CheckCircle2
                size={16}
                className={isCompleted ? 'text-blue-600 fill-blue-100' : 'text-muted-foreground/40'}
              />
            </button>
            {showKindBadge && (
              <Badge
                variant="outline"
                className={[
                  'text-[10px] px-1.5 py-0 font-medium',
                  isEmail
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200',
                ].join(' ')}
              >
                {isEmail ? 'Email' : 'Chat'}
              </Badge>
            )}
            <span
              className={[
                'text-xs whitespace-nowrap',
                !isRead ? 'font-semibold text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              {formatEmailDate(isEmail ? item.data.date : item.data.createTime)}
            </span>
          </div>
        </div>

        {item.kind === 'email' ? (
          <>
            <span
              className={[
                'text-sm flex items-center gap-1.5 min-w-0',
                !isRead ? 'font-semibold' : 'text-foreground/80',
              ].join(' ')}
            >
              {item.data.isForwarded && (
                <span title="You forwarded this message" className="shrink-0 inline-flex text-teal-600">
                  <Forward size={13} />
                </span>
              )}
              <span className="truncate">{item.data.subject || '(no subject)'}</span>
            </span>
            <span className="text-xs text-muted-foreground truncate">{item.data.snippet}</span>
            <EmailAttachmentChips msg={item.data} companyId={companyId} token={token} />
          </>
        ) : (
          <>
            <span className="text-xs font-medium text-muted-foreground truncate">
              {item.data.spaceName}
            </span>
            <span
              className={[
                'text-xs truncate flex items-center gap-1',
                !isRead ? 'font-medium text-foreground/80' : 'text-muted-foreground',
              ].join(' ')}
            >
              {item.data.hasAttachments && <Paperclip size={11} className="shrink-0" />}
              {item.data.text || (item.data.hasAttachments ? 'Attachment' : '(no text)')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Gmail-style attachment chips shown under an email's subject/snippet in the list.
 * Shows the first few, then a "+N" overflow (which just opens the email). Chip
 * clicks stop propagation so the row's own click (open/select) doesn't fire.
 */
function EmailAttachmentChips({
  msg,
  companyId,
  token,
}: {
  msg: EmailSummary;
  companyId: number;
  token: string | null;
}) {
  const atts = msg.attachments ?? [];
  if (atts.length === 0) return null;
  const shown = atts.slice(0, MAX_CHIPS);
  const overflow = atts.length - shown.length;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {shown.map((att) => (
        <AttachmentChip
          key={att.attachmentId}
          url={emailAttachmentUrl(token ?? '', companyId, msg.id, att, 'inline')}
          downloadUrl={emailAttachmentUrl(token ?? '', companyId, msg.id, att, 'attachment')}
          mimeType={att.mimeType}
          filename={att.filename}
        />
      ))}
      {overflow > 0 && (
        <span className="rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}
