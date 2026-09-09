import { Inbox, MessageSquare, Phone, type LucideIcon } from 'lucide-react';
import type { InternalMessageSummary } from '@/api/internalMessages';
import type { InternalCall } from '@/api/internalCalls';

/**
 * The internal "Cyg Finance" workspace inbox, where staff messages and staff-to-staff
 * calls are one time-ordered list — the same shape a client company's Communications tab
 * has for email, chat, calls and texts.
 *
 * ── WHY THIS IS NOT `ItemKind` ───────────────────────────────────────────────────
 * `ItemKind`, `KIND_STYLES`, `matchesKindFilter`, `getItemTimestamp` and
 * `CommunicationsTab`'s `stateMutations` are a CLOSED, `Record`-typed set describing a
 * client company's four channels. Adding internal members there turns every one of them
 * into a compile error that can only be satisfied with cases that can never occur for a
 * company — an email branch for a workspace with no mailbox, a phone-number branch for a
 * call that has no phone number in either direction.
 *
 * So the two inboxes share the PURE rules (`clampSources`, `showListSpinner`,
 * `formatEmailDate`, `CallSummaryPanel`) and keep their own small unions. That is the
 * same split `InternalMessageRow` already made against `InboxRow`.
 */
export type InternalItemKind = 'message' | 'call';

export type InternalItem =
  | { kind: 'message'; data: InternalMessageSummary }
  | { kind: 'call'; data: InternalCall };

/** Which rows the dropdown keeps. `all` is not an `InternalItemKind`. */
export type InternalKindFilter = 'all' | InternalItemKind;

/**
 * Also the Select's `items` — base-ui shows the raw value in the trigger without it.
 * Mirrors `KIND_FILTER_LABELS`, minus the `voicemail` pseudo-kind: the internal `<Dial>`
 * has no `<Record>` fallthrough, so an unanswered staff call leaves nothing behind and
 * there is no such thing as an internal voicemail to filter for.
 */
export const INTERNAL_KIND_FILTER_LABELS: Record<InternalKindFilter, string> = {
  all: 'All',
  message: 'Messages',
  call: 'Calls',
};

export const INTERNAL_KIND_FILTERS: InternalKindFilter[] = [
  'all',
  'message',
  'call',
];

export function isInternalKindFilter(v: unknown): v is InternalKindFilter {
  return v === 'all' || v === 'message' || v === 'call';
}

/**
 * Per-kind chrome, mirroring `KIND_STYLES`.
 *
 * Messages keep the workspace's teal (email is teal in the company inbox, and internal
 * messages have always used it); calls take the same green a company call uses, so a
 * call reads as a call in both inboxes.
 */
export interface InternalKindStyle {
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

export const INTERNAL_KIND_STYLES: Record<InternalItemKind, InternalKindStyle> =
  {
    message: {
      label: 'Internal',
      Icon: MessageSquare,
      accent: 'bg-teal-500',
      dot: 'bg-teal-500 border-teal-500',
      avatar: 'bg-teal-100 text-teal-700',
      badge: 'bg-teal-50 text-teal-700 border-teal-200',
      hoverUnread: 'bg-white hover:bg-teal-50/60',
      hoverRead: 'bg-muted/10 hover:bg-muted/30',
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
  };

export const INTERNAL_FOLDER_ICON: Record<string, LucideIcon> = { INBOX: Inbox };

/**
 * The id a row is keyed and selected by.
 *
 * ONE string space across both kinds. A message id is a number and a call sid is a bare
 * uuid, so without a prefix the two could collide the moment anything holds them in a
 * shared `Set`. The call side is minted server-in `InternalCallsService`
 * (`intcall:{sid}`) and echoed here; messages get theirs here because the server has no
 * reason to namespace a numeric primary key on its own.
 */
export const internalMessageItemId = (id: number) => `intmsg:${id}`;

export function internalItemId(item: InternalItem): string {
  return item.kind === 'message'
    ? internalMessageItemId(item.data.id)
    : item.data.id;
}

/**
 * The sort key that merges both channels into one time-ordered list.
 *
 * An EXHAUSTIVE switch with a `never` check, deliberately — not a ternary with a
 * fallback. A fallback would yield `undefined` for a future kind, then
 * `new Date(undefined).getTime() || 0` → **0**, and a zero here drags the watermark
 * cutoff to 0, which disables the clamp entirely and brings back the half-loaded
 * out-of-order tail it exists to prevent. Exactly the failure `getItemTimestamp`
 * documents on the company side; the `never` makes a missed kind a compile error.
 *
 * Note the two field names genuinely differ — a message carries `date` (it mirrors
 * Gmail's `EmailSummary`) and a call carries `at` (it mirrors the phone timeline).
 */
export function getInternalItemTimestamp(item: InternalItem): number {
  switch (item.kind) {
    case 'message':
      return new Date(item.data.date).getTime() || 0;
    case 'call':
      return new Date(item.data.at).getTime() || 0;
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}

/**
 * Does this row survive the kind dropdown and the free-text search?
 *
 * Search is server-side for messages (subject + body), so a message that came back
 * already matched and is never re-tested here. A call has no server-side search at all —
 * there is no text on it — so it is matched CLIENT-side on the one thing a person would
 * type: the colleague's name. Leaving calls unfiltered instead would make a search for
 * one person list every call with everybody.
 *
 * A STRUCTURED filter (from/to/subject/has-attachment/…) drops calls entirely: none of
 * those fields exist on a call, so any answer would be a guess.
 */
export function matchesInternalItem(
  item: InternalItem,
  opts: {
    filter: InternalKindFilter;
    search?: string;
    structuredSearch?: boolean;
  },
): boolean {
  if (opts.filter !== 'all' && item.kind !== opts.filter) return false;
  if (item.kind !== 'call') return true;
  if (opts.structuredSearch) return false;
  const q = opts.search?.trim().toLowerCase();
  if (!q) return true;
  return item.data.peer.name.toLowerCase().includes(q);
}
