import { CheckCircle2, Circle, Forward, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatEmailDate, senderInitial } from './message-utils';
import type { InternalMessageSummary } from '@/api/internalMessages';

interface InternalMessageRowProps {
  message: InternalMessageSummary;
  /** True in SENT, where read/complete state belongs to the recipients, not you. */
  sentView: boolean;
  isFirst: boolean;
  onOpen: () => void;
  onToggleRead: () => void;
  onToggleComplete: () => void;
}

const MAX_CHIPS = 3;

/**
 * One inbox row. Visual parity with the Communications tab's email row
 * (CommunicationsTab.tsx) — left accent bar for unread, read/unread toggle dot,
 * avatar initial, complete toggle, attachment chips — so the two inboxes read as
 * one system. Internal messages use a teal accent (email is teal, chat purple).
 */
export function InternalMessageRow({
  message,
  sentView,
  isFirst,
  onOpen,
  onToggleRead,
  onToggleComplete,
}: InternalMessageRowProps) {
  const unread = !message.isRead;
  // In SENT the row describes who you sent it to; elsewhere, who it came from.
  const person = sentView
    ? message.to.map((u) => u.name).join(', ') || '(no recipients)'
    : message.from.name;

  return (
    <div
      className={[
        'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer group',
        unread ? 'bg-white hover:bg-teal-50/60' : 'bg-muted/10 hover:bg-muted/30',
        isFirst ? '' : 'border-t border-border/60',
      ].join(' ')}
      onClick={onOpen}
    >
      {/* Unread accent bar */}
      {unread && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-teal-500 rounded-l-lg" />
      )}

      {/* Read/unread toggle dot — hidden in SENT, where it has no meaning. */}
      {sentView ? (
        <span className="mt-1 shrink-0 w-5 h-5" />
      ) : (
        <button
          type="button"
          className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
          title={message.isRead ? 'Mark as unread' : 'Mark as read'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead();
          }}
        >
          <span
            className={[
              'w-2.5 h-2.5 rounded-full border-2 transition-colors',
              unread
                ? 'bg-teal-500 border-teal-500'
                : 'bg-transparent border-muted-foreground/40',
            ].join(' ')}
          />
        </button>
      )}

      {/* Avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-semibold mt-0.5">
        {senderInitial(person)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={[
              'text-sm truncate',
              unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
            ].join(' ')}
          >
            {sentView ? `To: ${person}` : person}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!sentView && (
              <button
                type="button"
                title={message.isCompleted ? 'Mark as not completed' : 'Mark as completed'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleComplete();
                }}
                className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
              >
                {message.isCompleted ? (
                  <CheckCircle2 size={14} className="text-blue-600" />
                ) : (
                  <Circle size={14} className="text-muted-foreground/40" />
                )}
              </button>
            )}
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 bg-teal-50 text-teal-700 border-teal-200 font-medium"
            >
              Internal
            </Badge>
            <span
              className={[
                'text-xs whitespace-nowrap',
                unread ? 'font-semibold text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              {formatEmailDate(message.date)}
            </span>
          </div>
        </div>

        <span
          className={[
            'text-sm flex items-center gap-1.5 min-w-0',
            unread ? 'font-semibold' : 'text-foreground/80',
          ].join(' ')}
        >
          {message.isForward && (
            <span title="Forwarded message" className="shrink-0 inline-flex text-teal-600">
              <Forward size={13} />
            </span>
          )}
          <span className="truncate">{message.subject || '(no subject)'}</span>
        </span>

        <span className="text-xs text-muted-foreground truncate">
          {message.snippet}
        </span>

        {message.attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {message.attachments.slice(0, MAX_CHIPS).map((att) => (
              <span
                key={att.id}
                className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground max-w-[180px]"
                title={`${att.filename} · ${formatBytes(att.size)}`}
              >
                <Paperclip size={10} className="shrink-0" />
                <span className="truncate">{att.filename}</span>
              </span>
            ))}
            {message.attachments.length > MAX_CHIPS && (
              <span className="text-[10px] text-muted-foreground">
                +{message.attachments.length - MAX_CHIPS}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
