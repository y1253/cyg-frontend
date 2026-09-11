import {
  CheckCircle2, Forward, Paperclip,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Voicemail,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { EmailSummary, ChatInboxMessage } from '@/api/gmail';
import { stableEmailAttachmentUrl } from '@/lib/attachment-url';
import type { CallItem, SmsItem } from '@/api/phone';
import { formatE164 } from '@/lib/phone';
import { AttachmentChip } from '../AttachmentPreview';
import { displayName, formatEmailDate, senderInitial } from '../message-utils';
import { KIND_STYLES, type UnifiedItem } from './types';

const MAX_CHIPS = 3;

/** `131` -> `2m 11s`. Seconds alone stop being readable past a minute. */
function duration(totalSec: number): string {
  if (totalSec <= 0) return '0s';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * One row in the message list.
 *
 * This was written out three times: the email row and the chat row in the unified
 * inbox, and a third copy for the email-only folders (Sent/Spam/Trash) that was the
 * email row minus its checkbox and kind badge. They differ only in palette and in
 * which fields carry the sender/preview text, so both are derived from `item.kind`
 * and the extras are flags.
 *
 * With four kinds the palette is a lookup (`KIND_STYLES`) rather than a ternary —
 * ten four-way ternaries is not something anyone can read. The row's CONTENT stays a
 * switch over four small components, because those four are genuinely different
 * markup and table-driving them would be worse than what it replaced.
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
  onCall,
  isDraft = false,
}: {
  item: UnifiedItem;
  isFirst: boolean;
  selectionMode: boolean;
  selected: boolean;
  /** The unified inbox labels each row; a single-kind folder doesn't. */
  showKindBadge: boolean;
  companyId: number;
  token: string | null;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleRead: () => void;
  onToggleComplete: () => void;
  /** Dial a number straight from the row. Absent when no support number is attached. */
  onCall?: (number: string) => void;
  /**
   * This row is an unsent draft. A draft stays `kind: 'email'` on purpose — one
   * event, one id, so bulk select and the rest of the row machinery keep working —
   * so the Drafts folder passes this in rather than the row inferring it. It flips
   * the row to show RECIPIENTS instead of the sender (a draft's sender is always the
   * mailbox itself) and drops the read control, which means nothing on your own
   * unsent mail.
   */
  isDraft?: boolean;
}) {
  const style = KIND_STYLES[item.kind];
  const { isRead, isCompleted } = item.data;

  return (
    <div
      className={[
        'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer',
        item.kind === 'email' ? 'group' : '',
        selectionMode && selected
          ? 'bg-teal-50/70 hover:bg-teal-50'
          : isRead ? style.hoverRead : style.hoverUnread,
        isFirst ? '' : 'border-t border-border/60',
      ].join(' ')}
      onClick={() => (selectionMode ? onToggleSelect() : onOpen())}
    >
      {/* Unread accent bar */}
      {!isRead && (
        <span
          className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg ${style.accent}`}
        />
      )}
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="mt-1 shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
        </div>
      )}
      {/* Read/unread toggle dot. A draft is never unread and cannot be marked, so it
          gets a spacer instead — keeping the avatar and text aligned with every other
          row in the list. */}
      {isDraft ? (
        <span className="mt-1 shrink-0 w-5 h-5" aria-hidden />
      ) : (
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
            isRead ? 'bg-transparent border-muted-foreground/40' : style.dot,
            ].join(' ')}
          />
        </button>
      )}
      {/* Avatar */}
      <div
        className={[
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5',
          style.avatar,
        ].join(' ')}
      >
        <RowAvatar item={item} isDraft={isDraft} />
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={[
              'text-sm truncate flex items-center gap-1.5',
              !isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
            ].join(' ')}
          >
            <RowTitle item={item} isDraft={isDraft} />
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
                className={`text-[10px] px-1.5 py-0 font-medium ${style.badge}`}
              >
                {style.label}
              </Badge>
            )}
            <span
              className={[
                'text-xs whitespace-nowrap',
                !isRead ? 'font-semibold text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              {formatEmailDate(rowDate(item))}
            </span>
          </div>
        </div>

        <RowBody item={item} companyId={companyId} token={token} onCall={onCall} />
      </div>
    </div>
  );
}

/** The timestamp field differs per channel; `getItemTimestamp` covers the sort key. */
function rowDate(item: UnifiedItem): string {
  switch (item.kind) {
    case 'email':
      return item.data.date;
    case 'chat':
      return item.data.createTime;
    default:
      return item.data.at;
  }
}

function RowAvatar({ item, isDraft }: { item: UnifiedItem; isDraft?: boolean }) {
  switch (item.kind) {
    case 'email':
      return (
        <>{senderInitial(isDraft ? draftRecipients(item.data) : item.data.from)}</>
      );
    case 'chat':
      return <>{(item.data.sender[0] ?? '?').toUpperCase()}</>;
    default: {
      const { Icon } = KIND_STYLES[item.kind];
      return <Icon size={14} />;
    }
  }
}

/**
 * Who a draft is addressed to, or ''.
 *
 * Every draft in the folder shares one `from` — the mailbox — so without this the
 * list reads as the user's own address repeated and no row is distinguishable from
 * any other.
 */
function draftRecipients(msg: EmailSummary): string {
  return (msg.to ?? '').trim();
}

/**
 * Who a call or text row is with: the saved contact's name, else the number.
 *
 * One helper for both kinds so they can never disagree — the row, the detail view and
 * the notification bell all name the same person the same way. The NUMBER is still what
 * `CallBackButton` and the SMS thread key off; this is presentation only.
 */
function peerLabel(data: { counterparty: string; counterpartyName?: string | null }) {
  return (
    data.counterpartyName || formatE164(data.counterparty) || 'Unknown number'
  );
}

function RowTitle({ item, isDraft }: { item: UnifiedItem; isDraft?: boolean }) {
  switch (item.kind) {
    case 'email': {
      if (isDraft) {
        const to = draftRecipients(item.data);
        return to ? (
          <>{displayName(to)}</>
        ) : (
          <span className="italic text-muted-foreground">(no recipients)</span>
        );
      }
      return <>{displayName(item.data.from)}</>;
    }
    case 'chat':
      return (
        <>
          <KIND_STYLES.chat.Icon size={11} className="text-purple-500 shrink-0" />
          {item.data.sender}
        </>
      );
    case 'call':
      return (
        <>
          <CallDirectionIcon item={item.data} />
          {peerLabel(item.data)}
        </>
      );
    case 'sms':
      return (
        <>
          <KIND_STYLES.sms.Icon size={11} className="text-amber-500 shrink-0" />
          {peerLabel(item.data)}
        </>
      );
  }
}

/**
 * The "comma icon" for incoming / outgoing / missed, per the spec.
 *
 * Missed is red and checked first: it is the only one of the three that means
 * somebody still has to do something.
 */
function CallDirectionIcon({ item }: { item: CallItem }) {
  // Before the missed branch, because every voicemail is ALSO a miss — that is how it is
  // derived. Checked second and this is dead code.
  if (item.hasVoicemail) {
    return <Voicemail size={11} className="text-red-500 shrink-0" />;
  }
  if (item.outcome === 'missed' || item.outcome === 'failed') {
    return <PhoneMissed size={11} className="text-red-500 shrink-0" />;
  }
  return item.direction === 'inbound' ? (
    <PhoneIncoming size={11} className="text-green-600 shrink-0" />
  ) : (
    <PhoneOutgoing size={11} className="text-green-600 shrink-0" />
  );
}

function RowBody({
  item,
  companyId,
  token,
  onCall,
}: {
  item: UnifiedItem;
  companyId: number;
  token: string | null;
  onCall?: (number: string) => void;
}) {
  const isRead = item.data.isRead;

  switch (item.kind) {
    case 'email':
      return <EmailRowBody msg={item.data} companyId={companyId} token={token} isRead={isRead} />;
    case 'chat':
      return <ChatRowBody msg={item.data} isRead={isRead} />;
    case 'call':
      return <CallRowBody call={item.data} onCall={onCall} />;
    case 'sms':
      return <SmsRowBody msg={item.data} isRead={isRead} onCall={onCall} />;
  }
}

function EmailRowBody({
  msg,
  companyId,
  token,
  isRead,
}: {
  msg: EmailSummary;
  companyId: number;
  token: string | null;
  isRead: boolean;
}) {
  return (
    <>
      <span
        className={[
          'text-sm flex items-center gap-1.5 min-w-0',
          !isRead ? 'font-semibold' : 'text-foreground/80',
        ].join(' ')}
      >
        {msg.isForwarded && (
          <span title="You forwarded this message" className="shrink-0 inline-flex text-teal-600">
            <Forward size={13} />
          </span>
        )}
        <span className="truncate">{msg.subject || '(no subject)'}</span>
      </span>
      <span className="text-xs text-muted-foreground truncate">{msg.snippet}</span>
      <EmailAttachmentChips msg={msg} companyId={companyId} token={token} />
    </>
  );
}

function ChatRowBody({ msg, isRead }: { msg: ChatInboxMessage; isRead: boolean }) {
  return (
    <>
      <span className="text-xs font-medium text-muted-foreground truncate">
        {msg.spaceName}
      </span>
      <span
        className={[
          'text-xs truncate flex items-center gap-1',
          !isRead ? 'font-medium text-foreground/80' : 'text-muted-foreground',
        ].join(' ')}
      >
        {msg.hasAttachments && <Paperclip size={11} className="shrink-0" />}
        {msg.text || (msg.hasAttachments ? 'Attachment' : '(no text)')}
      </span>
    </>
  );
}

function CallRowBody({
  call,
  onCall,
}: {
  call: CallItem;
  onCall?: (number: string) => void;
}) {
  const label =
    call.hasVoicemail
      ? 'Voicemail'
      : call.outcome === 'missed'
        ? 'Missed call'
        : call.outcome === 'failed'
          ? 'Call failed'
          : call.outcome === 'in-progress'
            ? 'In progress'
            : `${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} · ${duration(call.durationSec)}`;

  // "Recorded" is what a CONVERSATION has. A voicemail already says so in its label, and
  // appending "· Recorded" to it would read as though the message itself were taped.
  const suffix = call.hasVoicemail
    ? ' · Tap to listen'
    : call.hasRecording
      ? ' · Recorded'
      : '';

  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={[
          'text-xs truncate',
          call.hasVoicemail ||
          call.outcome === 'missed' ||
          call.outcome === 'failed'
            ? 'font-medium text-red-600'
            : 'text-muted-foreground',
        ].join(' ')}
      >
        {label}
        {suffix}
      </span>
      <CallBackButton number={call.counterparty} onCall={onCall} />
    </div>
  );
}

function SmsRowBody({
  msg,
  isRead,
  onCall,
}: {
  msg: SmsItem;
  isRead: boolean;
  onCall?: (number: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={[
          'text-xs truncate flex items-center gap-1 min-w-0',
          !isRead ? 'font-medium text-foreground/80' : 'text-muted-foreground',
        ].join(' ')}
      >
        {msg.direction === 'outbound' && (
          <span className="shrink-0 text-muted-foreground/70">You:</span>
        )}
        {msg.numMedia > 0 && <Paperclip size={11} className="shrink-0" />}
        <span className="truncate">
          {msg.body || (msg.numMedia > 0 ? 'Attachment' : '(no text)')}
        </span>
      </span>
      <CallBackButton number={msg.counterparty} onCall={onCall} />
    </div>
  );
}

/**
 * "Call this number", on every call and text row.
 *
 * `stopPropagation` so it dials instead of opening the row — a click that silently
 * placed a phone call when the user meant to read the message would be the worst
 * possible misfire on this screen.
 */
function CallBackButton({
  number,
  onCall,
}: {
  number: string;
  onCall?: (number: string) => void;
}) {
  if (!onCall) return null;
  return (
    <button
      type="button"
      title={`Call ${formatE164(number)}`}
      onClick={(e) => {
        e.stopPropagation();
        onCall(number);
      }}
      className="shrink-0 inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100 transition-colors"
    >
      <KIND_STYLES.call.Icon size={10} />
      Call
    </button>
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
          // The file's identity, not Gmail's ephemeral attachmentId, which changes on
          // every 15s inbox poll and remounted every chip in the list. Same reason the
          // urls are frozen — see lib/attachment-url.ts.
          key={`${msg.id}:${att.filename}:${att.size ?? 0}`}
          url={stableEmailAttachmentUrl(token ?? '', companyId, msg.id, att, 'inline')}
          downloadUrl={stableEmailAttachmentUrl(token ?? '', companyId, msg.id, att, 'attachment')}
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
