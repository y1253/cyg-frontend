/**
 * Pure rules for the notification panel: how a feed row is styled, labelled, timed, and
 * turned back into something the Communications tab can open.
 *
 * Pure and unit-tested because the mapping to `Selection` is the one place a mistake is
 * completely invisible — the row renders, the click navigates, and nothing opens.
 */

import { Voicemail, type LucideIcon } from 'lucide-react';
import type { UnreadFeedItem } from '@/api/gmail';
import {
  KIND_STYLES,
  type KindStyle,
  type Selection,
} from '@/components/Companies/communications/types';
import { INTERNAL_KIND_STYLES } from '@/components/Companies/communications/internal-inbox';
import { formatEmailDate } from '@/components/Companies/message-utils';

/**
 * What the panel needs to draw one row, resolved from the two SEPARATE closed style
 * records rather than a third one.
 *
 * `KIND_STYLES` is `Record<ItemKind, …>` for a client company's four channels and
 * `INTERNAL_KIND_STYLES` is `Record<InternalItemKind, …>` for the workspace's two. They
 * are deliberately not one union (see `internal-inbox.ts`), so the feed reads from
 * whichever applies and expresses the voicemail difference in exactly one place — the
 * same technique `matchesKindFilter` uses for the voicemail pseudo-kind.
 */
export interface FeedRowChrome {
  label: string;
  Icon: LucideIcon;
  dot: string;
  avatar: string;
}

export function feedRowChrome(item: UnreadFeedItem): FeedRowChrome {
  const style: KindStyle =
    item.scope === 'internal'
      ? INTERNAL_KIND_STYLES[item.kind]
      : KIND_STYLES[item.kind];

  // A voicemail is still `kind: 'call'` — one event, one id, so read state and
  // selection keep working — but it is not the same thing to a reader, so it gets the
  // call's colour and its own label and icon.
  if (item.scope === 'company' && item.kind === 'call' && item.isVoicemail) {
    return {
      label: 'Voicemail',
      Icon: Voicemail,
      dot: style.dot,
      avatar: style.avatar,
    };
  }
  return {
    label: style.label,
    Icon: style.Icon,
    dot: style.dot,
    avatar: style.avatar,
  };
}

/**
 * A client company row, rebuilt as the `Selection` the Communications tab opens.
 *
 * Returns null for the internal workspace, whose inbox is a different component with a
 * different open model — representing that as a `Selection` would be a lie the type
 * system could not catch.
 */
export function selectionFromFeedItem(item: UnreadFeedItem): Selection | null {
  if (item.scope === 'internal') return null;
  switch (item.kind) {
    case 'email':
      return { kind: 'email', msgId: item.msgId, threadId: item.threadId };
    case 'chat':
      return {
        kind: 'chat',
        spaceId: item.spaceId,
        msgId: item.msgId,
        msgTime: item.msgTime,
      };
    case 'sms':
      return {
        kind: 'sms',
        peer: item.peer,
        msgId: item.msgId,
        msgTime: item.msgTime,
      };
    case 'call':
      return { kind: 'call', sid: item.sid, itemId: item.itemId };
    default: {
      // Exhaustive, the same rule `getItemTimestamp` follows: a new channel must be a
      // compile error here, not a row that silently refuses to open.
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}

/**
 * The id a selection's READ state is keyed by.
 *
 * A call's state key is its namespaced `itemId` (`swcall:{sid}`), NOT the bare `sid`
 * SignalWire uses — `ChatMessageReadState` / `MessageCompletedState` hold the former.
 * Passing `sid` here would write a row nothing ever reads back, so the message would
 * stay unread forever and keep reappearing in the bell.
 */
export function readIdForSelection(selection: Selection): string {
  return selection.kind === 'call' ? selection.itemId : selection.msgId;
}

/**
 * Where a click should land, and what it should open once it gets there.
 *
 * Declared WITHOUT `seq` and intersected below, not as `Omit<PendingOpen, 'seq'>`:
 * `Omit` over a union collapses it into one object type and loses the discriminant, so
 * `scope === 'company'` would stop narrowing to `selection`.
 */
export type OpenRequest =
  | { scope: 'company'; companyId: number; selection: Selection }
  | {
      scope: 'internal';
      companyId: number;
      target:
        | { kind: 'message'; threadId: number; messageId: number }
        | { kind: 'call'; sid: string };
    };

/** An `OpenRequest` stamped with a sequence number so a repeat click is not a no-op. */
export type PendingOpen = OpenRequest & { seq: number };

export function pendingOpenFromFeedItem(item: UnreadFeedItem): OpenRequest | null {
  if (item.scope === 'internal') {
    return {
      scope: 'internal',
      companyId: item.companyId,
      target:
        item.kind === 'message'
          ? {
              kind: 'message',
              threadId: item.threadId,
              messageId: item.messageId,
            }
          : { kind: 'call', sid: item.sid },
    };
  }
  const selection = selectionFromFeedItem(item);
  if (!selection) return null;
  return { scope: 'company', companyId: item.companyId, selection };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact age for a notification row — "now", "3m", "4h", "2d".
 *
 * `formatEmailDate` is the wrong shape here: it collapses anything recent to a bare
 * clock time, which in a list of notifications reads as an absolute time rather than a
 * freshness. Past a week it IS the better answer, so this delegates.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = now - then;
  // A row stamped slightly in the future (clock skew between us and a provider) must
  // read as new, not as a negative age.
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return formatEmailDate(iso);
}

/**
 * The number on the bell.
 *
 * `truncated` means a cap hid rows, so the exact count is not knowable — "50+" is the
 * honest answer, and it is still the count of rows the panel can show.
 */
export function badgeLabel(count: number, truncated: boolean): string {
  if (count > 99) return '99+';
  return truncated ? `${count}+` : String(count);
}
