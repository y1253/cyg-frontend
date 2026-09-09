import {
  CheckCircle2,
  Circle,
  Mic,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatEmailDate, senderInitial } from './message-utils';
import { INTERNAL_KIND_STYLES } from './communications/internal-inbox';
import type { InternalCall } from '@/api/internalCalls';

interface InternalCallRowProps {
  call: InternalCall;
  isFirst: boolean;
  onOpen: () => void;
  onToggleRead: () => void;
  onToggleComplete: () => void;
}

function duration(sec: number | null): string {
  if (sec === null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const OUTCOME_BADGE: Record<InternalCall['outcome'], string> = {
  answered: 'bg-green-50 text-green-700 border-green-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  'in-progress': 'bg-amber-50 text-amber-700 border-amber-200',
};

const OUTCOME_LABEL: Record<InternalCall['outcome'], string> = {
  answered: 'Answered',
  missed: 'Missed',
  'in-progress': 'In progress',
};

/**
 * One call in the workspace inbox, sitting between message rows.
 *
 * Structurally the same row as `InternalMessageRow` — accent bar, read dot, avatar,
 * complete toggle, date — in the green a call takes in the company inbox, so a call reads
 * as a call in both places. Content differs because a call has no subject, snippet or
 * attachments; what it has is a direction, a duration and an outcome.
 *
 * The read and complete controls are hidden for a call you PLACED, the same way
 * `sentView` hides them on a message you sent: your own call is projected read and
 * completed server-side, so a control there would be a button that does nothing.
 */
export function InternalCallRow({
  call,
  isFirst,
  onOpen,
  onToggleRead,
  onToggleComplete,
}: InternalCallRowProps) {
  const style = INTERNAL_KIND_STYLES.call;
  const unread = !call.isRead;
  const own = call.direction === 'outbound';
  const Icon =
    call.outcome === 'missed'
      ? PhoneMissed
      : own
        ? PhoneOutgoing
        : PhoneIncoming;

  return (
    <div
      className={[
        'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer group',
        unread ? style.hoverUnread : style.hoverRead,
        isFirst ? '' : 'border-t border-border/60',
      ].join(' ')}
      onClick={onOpen}
    >
      {/* Unread accent bar */}
      {unread && (
        <span
          className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg ${style.accent}`}
        />
      )}

      {/* Read/unread toggle dot — absent on your own call, which is read by definition. */}
      {own ? (
        <span className="mt-1 shrink-0 w-5 h-5" />
      ) : (
        <button
          type="button"
          className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
          title={call.isRead ? 'Mark as unread' : 'Mark as read'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead();
          }}
        >
          <span
            className={[
              'w-2.5 h-2.5 rounded-full border-2 transition-colors',
              unread ? style.dot : 'bg-transparent border-muted-foreground/40',
            ].join(' ')}
          />
        </button>
      )}

      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${style.avatar}`}
      >
        {senderInitial(call.peer.name)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={[
              'text-sm truncate',
              unread
                ? 'font-semibold text-foreground'
                : 'font-medium text-foreground/80',
            ].join(' ')}
          >
            {call.peer.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!own && (
              <button
                type="button"
                title={
                  call.isCompleted
                    ? 'Mark as not completed'
                    : 'Mark as completed'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleComplete();
                }}
                className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
              >
                {call.isCompleted ? (
                  <CheckCircle2 size={14} className="text-blue-600" />
                ) : (
                  <Circle size={14} className="text-muted-foreground/40" />
                )}
              </button>
            )}
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 font-medium ${style.badge}`}
            >
              {style.label}
            </Badge>
            <span
              className={[
                'text-xs whitespace-nowrap',
                unread ? 'font-semibold text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              {formatEmailDate(call.at)}
            </span>
          </div>
        </div>

        <span
          className={[
            'text-sm flex items-center gap-1.5 min-w-0',
            unread ? 'font-semibold' : 'text-foreground/80',
          ].join(' ')}
        >
          <Icon
            size={13}
            className={
              call.outcome === 'missed' ? 'text-red-600' : 'text-green-600'
            }
            aria-hidden
          />
          <span className="truncate">
            {own ? 'Outgoing call' : 'Incoming call'} · {duration(call.durationSec)}
          </span>
        </span>

        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 font-medium ${OUTCOME_BADGE[call.outcome]}`}
          >
            {OUTCOME_LABEL[call.outcome]}
          </Badge>
          {call.hasRecording && (
            <span className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Mic size={10} className="shrink-0" />
              Recorded
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
