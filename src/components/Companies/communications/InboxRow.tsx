import {
  CheckCircle2, Forward, Mic, Paperclip,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Voicemail,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { EmailSummary, ChatInboxMessage } from '@/api/gmail';
import { stableEmailAttachmentUrl } from '@/lib/attachment-url';
import type { CallItem, SmsItem } from '@/api/phone';
import {
  formatVoiceDuration,
  whatsappPeerLabel,
  whatsappPreviewText,
  type WhatsAppItem,
} from '@/api/whatsapp';
import { formatE164 } from '@/lib/phone';
import { AttachmentChip } from '../AttachmentPreview';
import { displayName, formatEmailDate, senderInitial } from '../message-utils';
import {
  isAlarmingOutcome,
  isImplicitlyRead,
  KIND_STYLES,
  type UnifiedItem,
} from './types';

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
  callBlockedReason = null,
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
  /** Set while this company's line is on a call: the row's Call button is disabled. */
  callBlockedReason?: string | null;
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
  // Nothing to toggle: the server rebuilds this row as read whatever the table says, so
  // the control would flip and bounce back. See `isImplicitlyRead`.
  const readLocked = isImplicitlyRead(item);

  return (
    <div
      className={[
        'relative flex cursor-pointer items-start gap-2.5 px-3 py-3.5 transition-colors sm:gap-3 sm:px-4',
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
      {/* Read/unread toggle dot. A draft is never unread and cannot be marked, and neither
          is an implicitly-read row (an outbound message, a call somebody answered), so both
          get a spacer instead — keeping the avatar and text aligned with every other row in
          the list. */}
      {isDraft || readLocked ? (
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

        <RowBody
          item={item}
          companyId={companyId}
          token={token}
          onCall={onCall}
          callBlockedReason={callBlockedReason}
        />
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
    case 'whatsapp':
      return (
        <>
          <KIND_STYLES.whatsapp.Icon size={11} className="text-emerald-600 shrink-0" />
          {whatsappPeerLabel(item.data)}
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
    return <Voicemail size={15} strokeWidth={2.25} className="text-red-500 shrink-0" />;
  }
  // ⚠️ Direction BEFORE outcome for outbound. A missed-call glyph depicts a call coming
  // IN, so putting it on a call the agent placed is simply the wrong picture — and the
  // card already says "Outgoing" two lines up, which it then contradicted.
  if (isAlarmingOutcome(item.outcome, item.direction)) {
    return <PhoneMissed size={15} strokeWidth={2.25} className="text-red-500 shrink-0" />;
  }
  const tone =
    item.outcome === 'missed' || item.outcome === 'failed'
      ? 'text-muted-foreground'
      : 'text-green-600';
  // ⚠️ 15px with a heavier stroke, not 11. These four glyphs differ ONLY in which way a
  // small arrow points, and at 11px hairline that distinction was not legible at a
  // glance — which is the only job the icon has on a row that already says the rest in
  // words.
  return item.direction === 'inbound' ? (
    <PhoneIncoming size={15} strokeWidth={2.25} className={`${tone} shrink-0`} />
  ) : (
    <PhoneOutgoing size={15} strokeWidth={2.25} className={`${tone} shrink-0`} />
  );
}

function RowBody({
  item,
  companyId,
  token,
  onCall,
  callBlockedReason,
}: {
  item: UnifiedItem;
  companyId: number;
  token: string | null;
  onCall?: (number: string) => void;
  callBlockedReason: string | null;
}) {
  const isRead = item.data.isRead;

  switch (item.kind) {
    case 'email':
      return <EmailRowBody msg={item.data} companyId={companyId} token={token} isRead={isRead} />;
    case 'chat':
      return <ChatRowBody msg={item.data} isRead={isRead} />;
    case 'call':
      return (
        <CallRowBody
          call={item.data}
          onCall={onCall}
          callBlockedReason={callBlockedReason}
        />
      );
    case 'sms':
      return (
        <SmsRowBody
          msg={item.data}
          isRead={isRead}
          onCall={onCall}
          callBlockedReason={callBlockedReason}
        />
      );
    case 'whatsapp':
      return (
        <WhatsAppRowBody
          msg={item.data}
          isRead={isRead}
          onCall={onCall}
          callBlockedReason={callBlockedReason}
        />
      );
  }
}

function WhatsAppRowBody({
  msg,
  isRead,
  onCall,
  callBlockedReason,
}: {
  msg: WhatsAppItem;
  isRead: boolean;
  onCall?: (number: string) => void;
  callBlockedReason: string | null;
}) {
  const isAudio = msg.type === 'audio';
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
        {isAudio ? (
          <Mic size={11} className="shrink-0 text-emerald-600" />
        ) : (
          msg.hasMedia && <Paperclip size={11} className="shrink-0" />
        )}
        <span className="truncate">
          {whatsappPreviewText(msg)}
          {isAudio && msg.durationSec != null && ` · ${formatVoiceDuration(msg.durationSec)}`}
        </span>
      </span>
      {/* A WhatsApp id is a phone number, so the company line can call it back. */}
      <CallBackButton
        number={`+${msg.peer}`}
        onCall={onCall}
        blockedReason={callBlockedReason}
      />
    </div>
  );
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
  callBlockedReason,
}: {
  call: CallItem;
  onCall?: (number: string) => void;
  callBlockedReason: string | null;
}) {
  const label =
    call.hasVoicemail
      ? 'Voicemail'
      : call.outcome === 'missed'
        ? // Direction-aware: a call WE placed that rang out is "No answer", not a missed
          // call. See `callOutcomeLabel` — no count moves, only the wording.
          call.direction === 'inbound'
          ? 'Missed call'
          : 'No answer'
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
          isAlarmingOutcome(call.outcome, call.direction)
            ? 'font-medium text-red-600'
            : 'text-muted-foreground',
        ].join(' ')}
      >
        {label}
        {suffix}
        {/* The AI one-liner, on the SAME line rather than a second one: the row is a
            fixed-height scanning surface, and letting a summary reflow it would make the
            list jump as summaries land minutes after their calls. Absent until the worker
            gets to it, and always absent when PHONE_SUMMARIZE_CALLS is off. */}
        {call.summaryLine ? (
          <span className="font-normal text-muted-foreground">
            {' · '}
            {call.summaryLine}
          </span>
        ) : null}
      </span>
      <CallBackButton
        number={call.counterparty}
        onCall={onCall}
        blockedReason={callBlockedReason}
      />
    </div>
  );
}

function SmsRowBody({
  msg,
  isRead,
  onCall,
  callBlockedReason,
}: {
  msg: SmsItem;
  isRead: boolean;
  onCall?: (number: string) => void;
  callBlockedReason: string | null;
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
      <CallBackButton
        number={msg.counterparty}
        onCall={onCall}
        blockedReason={callBlockedReason}
      />
    </div>
  );
}

/**
 * "Call this number", on every call, text and WhatsApp row.
 *
 * `stopPropagation` so it dials instead of opening the row — a click that silently
 * placed a phone call when the user meant to read the message would be the worst
 * possible misfire on this screen.
 *
 * ── WHY IT IS NEUTRAL AND NOT GREEN ───────────────────────────────────────────
 * It used to wear `KIND_STYLES.call`'s green, which put two near-identical greens on one
 * line of a WHATSAPP row — emerald channel badge beside a green action pill — and read as
 * the row being mislabelled "Call". Picking some third hue only moves the collision: all
 * five channel colours are spoken for (teal/blue email, purple chat, green call, amber
 * text, emerald WhatsApp). Neutral cannot collide with any of them, and it is also the
 * truer signal — this is an ACTION available on a row, not the row's channel. It fixes the
 * same latent clash on a call row, where green-on-green meant two different things.
 */
function CallBackButton({
  number,
  onCall,
  blockedReason,
}: {
  number: string;
  onCall?: (number: string) => void;
  /** Set while the line is on a call: disabled, and the wrapper's title says why. */
  blockedReason: string | null;
}) {
  if (!onCall) return null;
  return (
    // The wrapper carries the tooltip (a disabled button shows none) and swallows the
    // click, so pressing a disabled Call never falls through to opening the row.
    <span
      className="shrink-0 inline-flex"
      title={blockedReason ?? `Call ${formatE164(number)}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={!!blockedReason}
        onClick={(e) => {
          e.stopPropagation();
          onCall(number);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted/60 disabled:hover:text-muted-foreground"
      >
        <KIND_STYLES.call.Icon size={10} />
        Call
      </button>
    </span>
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
