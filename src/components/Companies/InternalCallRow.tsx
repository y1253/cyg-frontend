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
import {
  INTERNAL_KIND_STYLES,
  isImplicitlyReadInternalCall,
} from './communications/internal-inbox';
import type { InternalCall } from '@/api/internalCalls';
import {
  callOutcomeLabel,
  isAlarmingOutcome,
} from './communications/types';

interface InternalCallRowProps {
  call: InternalCall;
  isFirst: boolean;
  onOpen: () => void;
  onToggleRead: () => void;
  onToggleComplete: () => void;
  /** Ring this colleague back. Omitted where dialling is not available. */
  onCallBack?: () => void;
  /** Why calling is unavailable right now, or null. Shown as the button's tooltip. */
  callBlockedReason?: string | null;
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

// Labels come from `callOutcomeLabel` — shared with the company inbox so the two cannot
// drift on wording. "Missed" depends on which way the call went.

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
 *
 * ⚠️ The read dot is hidden for an ANSWERED incoming call too, for the same reason one
 * step further out: read state is "a row exists ⇔ read", so a call the server stamps read
 * by construction cannot be marked unread — the toggle would flip and bounce back on the
 * next poll. See `isImplicitlyReadInternalCall`.
 */
export function InternalCallRow({
  call,
  isFirst,
  onOpen,
  onToggleRead,
  onToggleComplete,
  onCallBack,
  callBlockedReason,
}: InternalCallRowProps) {
  const style = INTERNAL_KIND_STYLES.call;
  const unread = !call.isRead;
  const own = call.direction === 'outbound';
  const readByConstruction = isImplicitlyReadInternalCall(call);
  // A missed-call glyph depicts a call coming IN, so a call this user PLACED keeps its
  // own arrow — the row already says "Outgoing call" on the next line.
  const alarming = isAlarmingOutcome(call.outcome, call.direction);
  const Icon = alarming ? PhoneMissed : own ? PhoneOutgoing : PhoneIncoming;

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

      {/* Read/unread toggle dot — absent on a call that is read by construction: your
          own, or one you answered. Marking either unread is a no-op that bounces back. */}
      {readByConstruction ? (
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
            {onCallBack && (
              // Ring this colleague back, without opening the call first. The detail view
              // has had this button all along; the row — the thing people actually look
              // at — did not, so the one action a call log exists to prompt meant a click
              // into the call and a wait for it to load.
              //
              // ⚠️ `opacity-0 … group-hover:opacity-100 focus-within:opacity-100`, NEVER
              // `hidden`: `hidden` takes the button out of the tab order, which is the
              // regression `NotificationPanel` documents on exactly this pattern.
              <button
                type="button"
                title={callBlockedReason ?? `Call ${call.peer.name} back`}
                aria-label={`Call back: ${call.peer.name}`}
                disabled={!!callBlockedReason}
                onClick={(e) => {
                  e.stopPropagation();
                  onCallBack();
                }}
                className="flex items-center justify-center w-5 h-5 rounded-full text-green-700 opacity-0 transition-opacity hover:bg-green-100 focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
              >
                <PhoneOutgoing size={13} />
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
              alarming
                ? 'text-red-600'
                : call.outcome === 'missed'
                  ? 'text-muted-foreground'
                  : 'text-green-600'
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
            className={`text-[10px] px-1.5 py-0 font-medium ${
              // An outgoing call that rang out is not a backlog item, so it loses the red
              // as well as the word -- see `isAlarmingOutcome`.
              call.outcome === 'missed' && !alarming
                ? 'bg-muted text-muted-foreground border-border'
                : OUTCOME_BADGE[call.outcome]
            }`}
          >
            {callOutcomeLabel(call.outcome, call.direction)}
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
