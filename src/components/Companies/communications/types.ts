import {
  Inbox, Mail, SendHorizonal, AlertOctagon, Trash, Circle,
  MessageSquare, Phone, MessageSquareText, type LucideIcon,
} from 'lucide-react';
import type { EmailSummary, ChatInboxMessage } from '@/api/gmail';
import type { CallItem, SmsItem } from '@/api/phone';

export const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'UNCOMPLETED', label: 'Uncompleted', icon: Circle },
  { id: 'UNREAD', label: 'Unread', icon: Mail },
  { id: 'SENT', label: 'Sent', icon: SendHorizonal },
  { id: 'SPAM', label: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', label: 'Trash', icon: Trash },
] as const;

export const ALL_LABELS: string[] = FOLDERS.map((f) => f.id);

/** Folders that need a connected mailbox. Phone-only companies never see them. */
export const MAILBOX_ONLY_FOLDERS = ['SENT', 'SPAM', 'TRASH'];

// Tabs backed by the unified INBOX view (emails + chats + calls + texts).
// UNCOMPLETED and UNREAD fetch the same INBOX data and apply a forced
// completion/read filter on top.
export const INBOX_TABS = ['INBOX', 'UNCOMPLETED', 'UNREAD'];

/**
 * PAGINATION units vs RENDER units — they are deliberately not the same.
 *
 * `SourceKind` is what the inbox pages over: three independently-paged streams. Calls
 * and texts arrive together from one `/timeline` endpoint, so they share one cursor
 * and one `hasNext`; splitting them into two sources would make the watermark clamp
 * pick whichever of the two happened to be older and hide rows for no reason.
 *
 * `ItemKind` is what a row renders as and what the kind filter offers.
 */
export type SourceKind = 'email' | 'chat' | 'phone';
export type ItemKind = 'email' | 'chat' | 'call' | 'sms';

/** Also the Select's `items` — base-ui shows the raw value in the trigger without it. */
export const KIND_FILTER_LABELS: Record<string, string> = {
  all: 'All',
  email: 'Email',
  chat: 'Chat',
  call: 'Calls',
  sms: 'Texts',
  voicemail: 'Voicemail',
};

/**
 * `'voicemail'` is a PSEUDO-KIND, not an `ItemKind`.
 *
 * A voicemail row is still `kind: 'call'` — the missed call and the message it left are
 * one event sharing one id, which is what keeps read/completed state and bulk select
 * working. So it cannot be matched by comparing `it.kind`, and `matchesKindFilter` is
 * where that difference is expressed, once.
 */
export type KindFilter = 'all' | ItemKind | 'voicemail';

/** Does this row survive the kind dropdown? */
export function matchesKindFilter(item: UnifiedItem, filter: KindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'voicemail')
    return item.kind === 'call' && item.data.hasVoicemail;
  return item.kind === filter;
}

export type UnifiedItem =
  | { kind: 'email'; data: EmailSummary }
  | { kind: 'chat'; data: ChatInboxMessage }
  | { kind: 'call'; data: CallItem }
  | { kind: 'sms'; data: SmsItem };

/**
 * Per-kind chrome: the palette and label that identify a channel at a glance.
 *
 * A table rather than the nested ternaries this replaced. The row used to derive ten
 * separate values from `isEmail`; with four kinds each of those becomes a four-way
 * choice, and ten four-way ternaries is not something anyone can read.
 *
 * Row CONTENT stays a switch over small components — the four bodies are genuinely
 * different markup, and table-driving them would be worse than the ternaries.
 *
 * Hue is the channel's identity here: email teal/blue and chat purple are unchanged,
 * calls take green and texts amber so neither can be mistaken for chat.
 */
export interface KindStyle {
  label: string;
  Icon: LucideIcon;
  /** Unread accent bar down the left edge of the row. */
  accent: string;
  /** Filled unread dot. */
  dot: string;
  avatar: string;
  badge: string;
  hoverUnread: string;
  hoverRead: string;
}

export const KIND_STYLES: Record<ItemKind, KindStyle> = {
  email: {
    label: 'Email',
    Icon: Mail,
    accent: 'bg-teal-500',
    dot: 'bg-teal-500 border-teal-500',
    avatar: 'bg-blue-100 text-blue-700',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    hoverUnread: 'bg-white hover:bg-blue-50/60',
    hoverRead: 'bg-muted/10 hover:bg-muted/30',
  },
  chat: {
    label: 'Chat',
    Icon: MessageSquare,
    accent: 'bg-purple-500',
    dot: 'bg-purple-500 border-purple-500',
    avatar: 'bg-purple-100 text-purple-700',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    hoverUnread: 'bg-white hover:bg-purple-50/60',
    hoverRead: 'bg-muted/10 hover:bg-purple-50/40',
  },
  call: {
    label: 'Call',
    Icon: Phone,
    accent: 'bg-green-500',
    dot: 'bg-green-500 border-green-500',
    avatar: 'bg-green-100 text-green-700',
    badge: 'bg-green-50 text-green-700 border-green-200',
    hoverUnread: 'bg-white hover:bg-green-50/60',
    hoverRead: 'bg-muted/10 hover:bg-green-50/40',
  },
  sms: {
    label: 'Text',
    Icon: MessageSquareText,
    accent: 'bg-amber-500',
    dot: 'bg-amber-500 border-amber-500',
    avatar: 'bg-amber-100 text-amber-700',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    hoverUnread: 'bg-white hover:bg-amber-50/60',
    hoverRead: 'bg-muted/10 hover:bg-amber-50/40',
  },
};

// Minimal shape needed to natively quote a chat message in a reply.
export type QuoteTarget = {
  id: string;
  sender: string;
  text: string;
  lastUpdateTime: string;
};

/** Which message the confirm dialog is about, and whether it was raised from an
 *  open message (in which case confirming also exits back to the inbox). */
export type CompleteTarget = {
  kind: ItemKind;
  id: string;
  fromDetail?: boolean;
};

/**
 * Which detail view is open, if any.
 *
 * One discriminated union rather than a nullable id per kind. The invariant "exactly
 * one thing is open" used to be maintained by hand in five places — every open handler
 * setting one id and nulling the others — and with four kinds that hand-maintenance
 * is quadratic and drifts. Here the wrong combination is unrepresentable, and
 * TypeScript narrows `selected.kind` so a branch cannot read another kind's fields.
 */
export type Selection =
  | { kind: 'email'; msgId: string; threadId: string | null }
  | { kind: 'chat'; spaceId: string; msgId: string; msgTime: string }
  | { kind: 'sms'; peer: string; msgId: string; msgTime: string }
  | { kind: 'call'; sid: string; itemId: string };

/**
 * The sort key that merges every channel into one time-ordered list.
 *
 * An EXHAUSTIVE switch with a `never` check, deliberately — not a ternary with a
 * fallback. The previous form returned `item.data.createTime` for anything that was
 * not an email, so a new kind would have silently yielded `undefined`, then
 * `new Date(undefined).getTime() || 0` → **0**. A zero here drags the inbox's
 * watermark cutoff to 0, which disables the clamp entirely and brings back the
 * half-loaded out-of-order tail the clamp exists to prevent — a subtle rendering bug
 * far from its cause. The `never` makes a missed kind a compile error instead.
 */
export function getItemTimestamp(item: UnifiedItem): number {
  switch (item.kind) {
    case 'email':
      return new Date(item.data.date).getTime() || 0;
    case 'chat':
      return new Date(item.data.createTime).getTime() || 0;
    case 'call':
    case 'sms':
      return new Date(item.data.at).getTime() || 0;
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}
