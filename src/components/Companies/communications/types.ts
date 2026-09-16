import {
  Inbox, Mail, SendHorizonal, AlertOctagon, Trash, Circle, FileText,
  MessageSquare, Phone, MessageSquareText, MessageCircle, Contact, PhoneMissed,
  type LucideIcon,
} from 'lucide-react';
import type { EmailSummary, ChatInboxMessage } from '@/api/gmail';
import type { CallItem, SmsItem } from '@/api/phone';
import type { WhatsAppItem } from '@/api/whatsapp';

export const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'UNCOMPLETED', label: 'Uncompleted', icon: Circle },
  { id: 'UNREAD', label: 'Unread', icon: Mail },
  // Unread missed calls and voicemails. A filtered view over the same merged inbox as
  // UNREAD, narrowed to one kind of row — see `isUnreadMissedCall`.
  { id: 'MISSED', label: 'Missed calls', icon: PhoneMissed },
  { id: 'DRAFTS', label: 'Drafts', icon: FileText },
  { id: 'SENT', label: 'Sent', icon: SendHorizonal },
  { id: 'SPAM', label: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', label: 'Trash', icon: Trash },
  // Not a mail folder at all: it holds no messages and fetches nothing from a provider.
  // It lives here because it is a TAB, and this array is what the tab strip renders --
  // but it is deliberately absent from INBOX_TABS and MAILBOX_ONLY_FOLDERS below, and
  // CommunicationsTab returns the contacts panel before any inbox machinery runs.
  { id: 'CONTACTS', label: 'Contacts', icon: Contact },
] as const;

/** The one folder that is not a folder. Exported so the guards below read as prose. */
export const CONTACTS_FOLDER = 'CONTACTS';

/**
 * Every id the persisted view state may name. Its ONLY consumer is the restore check in
 * `CommunicationsTab`, which is why adding CONTACTS here is safe: it widens what a stored
 * blob may say, and invalidates nothing already stored.
 */
export const ALL_LABELS: string[] = FOLDERS.map((f) => f.id);

/** Folders that need a connected mailbox. Phone-only companies never see them. */
export const MAILBOX_ONLY_FOLDERS = ['DRAFTS', 'SENT', 'SPAM', 'TRASH'];

/** Folders that need a support number. A company without one could never fill them. */
export const PHONE_ONLY_FOLDERS = ['MISSED'];

// Tabs backed by the unified INBOX view (emails + chats + calls + texts).
// DRAFTS is deliberately NOT one of them: it is an email-only folder like SENT, so it
// renders straight off emailItems with no merge against chats and calls, no kind
// filter, and no watermark clamp. Adding it here would time-sort unsent drafts in
// among incoming calls and texts.
// UNCOMPLETED and UNREAD fetch the same INBOX data and apply a forced
// completion/read filter on top. MISSED does too, narrowed to unread missed calls — and
// CommunicationsTab switches the mail, chat and WhatsApp sources off while it is open,
// since none of their rows could ever match.
export const INBOX_TABS = ['INBOX', 'UNCOMPLETED', 'UNREAD', 'MISSED'];

/**
 * PAGINATION units vs RENDER units — they are deliberately not the same.
 *
 * `SourceKind` is what the inbox pages over: three independently-paged streams. Calls
 * and texts arrive together from one `/timeline` endpoint, so they share one cursor
 * and one `hasNext`; splitting them into two sources would make the watermark clamp
 * pick whichever of the two happened to be older and hide rows for no reason.
 *
 * `ItemKind` is what a row renders as and what the kind filter offers.
 *
 * WhatsApp is its own source (and its own kind): it is paged by a separate endpoint over
 * our own database, with a cursor unrelated to the phone timeline's.
 */
export type SourceKind = 'email' | 'chat' | 'phone' | 'whatsapp';
export type ItemKind = 'email' | 'chat' | 'call' | 'sms' | 'whatsapp';

/** Also the Select's `items` — base-ui shows the raw value in the trigger without it. */
export const KIND_FILTER_LABELS: Record<string, string> = {
  all: 'All',
  email: 'Email',
  chat: 'Chat',
  call: 'Calls',
  sms: 'Texts',
  whatsapp: 'WhatsApp',
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

/**
 * A row that is READ by construction, so "Mark as unread" on it would do NOTHING.
 *
 * Read state is "a row exists ⇔ read" in a shared table, which gives it no way to record
 * that an implicitly-read item was later marked unread: the mark-unread call deletes a row
 * that is not there, and the server rebuilds the item as read on the next poll. The control
 * flips optimistically and bounces back — so it is hidden instead.
 *
 * Calls: outbound (you cannot have an unread call you placed) and inbound calls somebody
 * ANSWERED. A missed call — a voicemail included — stays unread and stays markable.
 * Texts: outbound only.
 *
 * ⚠️ Mirrors `isImplicitlyReadCall` in server `phone/phone-timeline.util.ts`, which is what
 * actually stamps `isRead`. If the two disagree, the control reappears on a row where it
 * does nothing.
 */
export function isImplicitlyRead(item: UnifiedItem): boolean {
  if (item.kind === 'sms') return item.data.direction === 'outbound';
  if (item.kind !== 'call') return false;
  if (item.data.direction === 'outbound') return true;
  // Exhaustive, for the reason the server copy gives: a fifth outcome must break the
  // build in BOTH copies rather than defaulting silently in either direction.
  switch (item.data.outcome) {
    case 'answered':
    case 'in-progress':
      return true;
    case 'missed':
    case 'failed':
      return false;
    default: {
      const never: never = item.data.outcome;
      return never;
    }
  }
}

/**
 * An UNREAD MISSED CALL — what the Missed calls folder lists.
 *
 * Voicemails match with no clause of their own: the server only sets `hasVoicemail` on an
 * inbound call whose outcome is `missed`. Outbound rows never match — a call we placed
 * that nobody answered is not a caller waiting on us.
 *
 * ⚠️ Mirrors `isUnreadMissedCall` in server `phone/phone-timeline.util.ts`, which is what
 * the folder's BADGE counts with. If the two disagree, the list and its number disagree.
 */
export function isUnreadMissedCall(item: UnifiedItem): boolean {
  return (
    item.kind === 'call' &&
    item.data.direction === 'inbound' &&
    item.data.outcome === 'missed' &&
    !item.data.isRead
  );
}

export type UnifiedItem =
  | { kind: 'email'; data: EmailSummary }
  | { kind: 'chat'; data: ChatInboxMessage }
  | { kind: 'call'; data: CallItem }
  | { kind: 'sms'; data: SmsItem }
  | { kind: 'whatsapp'; data: WhatsAppItem };

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
  // Emerald rather than calls' green-500, so the two stay distinguishable side by side.
  whatsapp: {
    label: 'WhatsApp',
    Icon: MessageCircle,
    accent: 'bg-emerald-600',
    dot: 'bg-emerald-600 border-emerald-600',
    avatar: 'bg-emerald-100 text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hoverUnread: 'bg-white hover:bg-emerald-50/60',
    hoverRead: 'bg-muted/10 hover:bg-emerald-50/40',
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
  | { kind: 'whatsapp'; peer: string; msgId: string; msgTime: string }
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
    case 'whatsapp':
      return new Date(item.data.at).getTime() || 0;
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}
