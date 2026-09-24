/**
 * Pure rules for the notification panel: how a feed row is styled, labelled, timed, and
 * turned back into something the Communications tab can open.
 *
 * Pure and unit-tested because the mapping to `Selection` is the one place a mistake is
 * completely invisible — the row renders, the click navigates, and nothing opens.
 */

import { PhoneMissed, Voicemail, type LucideIcon } from 'lucide-react';
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
  // ⚠️ AFTER the voicemail branch, never before it. Every voicemail is also a missed
  // call, and "Voicemail" is the more useful of the two labels — the same precedence
  // `InboxRow` applies. Swapping them would silently retitle every voicemail.
  if (item.kind === 'call' && item.isMissed) {
    return {
      label: 'Missed call',
      Icon: PhoneMissed,
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
 * A missed call — voicemails included, since every voicemail is a missed call that left
 * a message.
 *
 * Reads the server's `isMissed` rather than matching on `title`. `title` is a display
 * string built by `callTitle`, and the feed carries answered-but-unread inbound calls
 * too, so there is nothing else on the row that can tell them apart.
 */
export function isMissedCallRow(item: UnreadFeedItem): boolean {
  return item.kind === 'call' && item.isMissed;
}

/**
 * Can this row be rung back, and what would it dial?
 *
 * Every `kind: 'call'` row with a target, NOT only the missed ones. Every row in this feed
 * is unread by definition and an answered call is now read by construction, so what remains
 * is already missed, failed or a voicemail — and gating on `isMissed` would leave a FAILED
 * inbound call (a real case: the SIP child reported `failed`) with no way to call back, for
 * no benefit.
 *
 * The honest gate is "is there something to dial", which is also the one that narrows the
 * type: a company call carries an E.164 `peer` — null when the caller withheld a number, so
 * the button is hidden rather than offered and broken — and a staff call carries a user id,
 * because an internal call has no number anywhere in its path.
 */
export type ReturnCallTarget =
  | { scope: 'company'; companyId: number; to: string }
  | { scope: 'internal'; calleeId: number };

export function returnCallTarget(item: UnreadFeedItem): ReturnCallTarget | null {
  if (item.kind !== 'call') return null;
  if (item.scope === 'internal') {
    return { scope: 'internal', calleeId: item.peerUserId };
  }
  return item.peer
    ? { scope: 'company', companyId: item.companyId, to: item.peer }
    : null;
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
    case 'whatsapp':
      return {
        kind: 'whatsapp',
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

/**
 * The missed-call numbers, with rows the user has just read already taken off.
 *
 * ── WHY A COUNT NEEDS THIS AT ALL ──────────────────────────────────────────────
 * `unreadFeedDismiss` hides a ROW; it structurally cannot change a NUMBER. So marking a
 * missed call read made it vanish from the bell instantly while the header pill and the
 * browser-tab badge kept the old figure until a refetch of the heaviest endpoint in the
 * app came back — long enough that `MissedCallsIndicator` renders "Showing 0 of 1", and
 * if the count was 1 the pill does not even disappear.
 *
 * ⚠️ **This can never double-subtract, and that is the whole design.** The adjustment is
 * derived from rows STILL PRESENT in the server's payload. The moment a refetch drops a
 * row, there is nothing left to match and its adjustment disappears on its own — so a
 * server that has already caught up is never decremented twice. No expiry, no
 * reconciliation, no state of its own.
 *
 * ⚠️ An ABSENT company key is left absent, never created. Absent means *unknown*,
 * deliberately distinct from 0 — `CompanyRow` renders no badge for a missing key, and
 * subtracting into a new one would invent a zero the server never asserted.
 */
export function adjustMissedForDismissed(input: {
  /** The raw feed as the server sent it, BEFORE the dismiss filter. */
  rawUnread: readonly UnreadFeedItem[];
  missedCalls: Record<number, number> | undefined;
  missedCallsOwn: number;
  dismissed: ReadonlySet<string>;
}): { missedCalls: Record<number, number> | undefined; missedCallsOwn: number } {
  const { rawUnread, missedCalls, missedCallsOwn, dismissed } = input;
  if (dismissed.size === 0) return { missedCalls, missedCallsOwn };

  let ownDrop = 0;
  const perCompany = new Map<number, number>();
  for (const item of rawUnread) {
    if (!dismissed.has(item.id) || !isMissedCallRow(item)) continue;
    perCompany.set(item.companyId, (perCompany.get(item.companyId) ?? 0) + 1);
    ownDrop += 1;
  }
  if (ownDrop === 0) return { missedCalls, missedCallsOwn };

  let nextMap = missedCalls;
  if (missedCalls) {
    nextMap = { ...missedCalls };
    for (const [companyId, n] of perCompany) {
      // Only touch what the server actually reported a number for.
      if (!(companyId in nextMap)) continue;
      nextMap[companyId] = Math.max(0, nextMap[companyId] - n);
    }
  }

  // ⚠️ Clamped. A dismissal can land while a refetch is in flight, and a negative here
  // would render as a literal "-1" on the tab badge.
  return { missedCalls: nextMap, missedCallsOwn: Math.max(0, missedCallsOwn - ownDrop) };
}
