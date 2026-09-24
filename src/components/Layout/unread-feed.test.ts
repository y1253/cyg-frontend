import { describe, expect, it } from 'vitest';
import {
  adjustMissedForDismissed,
  badgeLabel,
  feedRowChrome,
  isMissedCallRow,
  pendingOpenFromFeedItem,
  readIdForSelection,
  relativeTime,
  returnCallTarget,
  selectionFromFeedItem,
} from './unread-feed';
import { isValidSelection } from '@/components/Companies/communications/useCommUiState';
import type { UnreadFeedItem } from '@/api/gmail';

/**
 * The notification panel's pure rules.
 *
 * The deep-link mapping is the important half: if a feed item produces a `Selection`
 * the restorer rejects, the row still renders and the click still navigates — it just
 * opens nothing, with no error anywhere. That is what the first test prevents.
 */

const base = {
  companyId: 4,
  companyName: 'Acme',
  from: 'Jane',
  title: 'Invoice',
  snippet: 'hello',
  at: '2026-09-10T11:00:00.000Z',
};

/** One of every variant the server can send. */
const ITEMS: UnreadFeedItem[] = [
  { ...base, id: 'm1', scope: 'company', kind: 'email', msgId: 'm1', threadId: 't1' },
  // A thread-less email is a real case (a single message with no conversation).
  { ...base, id: 'm2', scope: 'company', kind: 'email', msgId: 'm2', threadId: null },
  {
    ...base,
    id: 'spaces/A/messages/B',
    scope: 'company',
    kind: 'chat',
    spaceId: 'spaces/A',
    msgId: 'spaces/A/messages/B',
    msgTime: '2026-09-10T11:00:00.123456Z',
  },
  {
    ...base,
    id: 'swsms:s1',
    scope: 'company',
    kind: 'sms',
    peer: '+14385551212',
    msgId: 'swsms:s1',
    msgTime: '2026-09-10T11:00:00.000Z',
  },
  {
    ...base,
    id: 'swcall:c1',
    scope: 'company',
    kind: 'call',
    sid: 'c1',
    itemId: 'swcall:c1',
    peer: '+14385551212',
    isVoicemail: false,
    isMissed: false,
  },
  {
    ...base,
    id: 'intmsg:12',
    scope: 'internal',
    kind: 'message',
    messageId: 12,
    threadId: 12,
  },
  {
    ...base,
    id: 'intcall:c9',
    scope: 'internal',
    kind: 'call',
    sid: 'c9',
    peerUserId: 7,
    isMissed: false,
  },
  // Appended rather than inserted, so the ITEMS[n] indexes the tests below use hold.
  {
    ...base,
    id: 'wa:7',
    scope: 'company',
    kind: 'whatsapp',
    peer: '15145550000',
    msgId: 'wa:7',
    msgTime: '2026-09-10T11:00:00.000Z',
  },
];

const companyItems = ITEMS.filter((i) => i.scope === 'company');

describe('deep link — feed item to Selection', () => {
  it('every company variant maps to a Selection the restorer accepts', () => {
    // `isValidSelection` is what `useRestoredCommUi` gates on. A variant it rejects is a
    // row that navigates and then opens nothing.
    for (const item of companyItems) {
      const selection = selectionFromFeedItem(item);
      expect(selection, `${item.kind} produced no selection`).not.toBeNull();
      expect(isValidSelection(selection), `${item.kind} rejected`).toBe(true);
    }
  });

  it('covers every variant the server can send', () => {
    // Guards the loop above: if a new kind is added and not added here, this fails
    // rather than the suite quietly testing one case fewer.
    expect(ITEMS.map((i) => `${i.scope}:${i.kind}`)).toEqual([
      'company:email',
      'company:email',
      'company:chat',
      'company:sms',
      'company:call',
      'internal:message',
      'internal:call',
      'company:whatsapp',
    ]);
  });

  it('opens a WhatsApp row as a WhatsApp thread keyed by the peer', () => {
    expect(selectionFromFeedItem(ITEMS[7])).toEqual({
      kind: 'whatsapp',
      peer: '15145550000',
      msgId: 'wa:7',
      msgTime: '2026-09-10T11:00:00.000Z',
    });
    expect(feedRowChrome(ITEMS[7]).label).toBe('WhatsApp');
  });

  it('returns null for the internal workspace, which has its own open model', () => {
    const internal = ITEMS.filter((i) => i.scope === 'internal');
    for (const item of internal) expect(selectionFromFeedItem(item)).toBeNull();
  });

  it('readIdForSelection uses itemId for a call, not sid', () => {
    // `sid` here would write read state nothing reads back, so the row would keep
    // coming back to the bell forever.
    expect(readIdForSelection({ kind: 'call', sid: 'c1', itemId: 'swcall:c1' })).toBe(
      'swcall:c1',
    );
    expect(
      readIdForSelection({ kind: 'email', msgId: 'm1', threadId: null }),
    ).toBe('m1');
  });

  it('keeps a chat’s raw anchor time, not a rounded one', () => {
    const selection = selectionFromFeedItem(ITEMS[2]);
    expect(selection).toMatchObject({ msgTime: '2026-09-10T11:00:00.123456Z' });
  });
});

describe('pendingOpenFromFeedItem', () => {
  it('routes a company row to its selection and an internal row to its target', () => {
    expect(pendingOpenFromFeedItem(ITEMS[0])).toEqual({
      scope: 'company',
      companyId: 4,
      selection: { kind: 'email', msgId: 'm1', threadId: 't1' },
    });
    expect(pendingOpenFromFeedItem(ITEMS[5])).toEqual({
      scope: 'internal',
      companyId: 4,
      target: { kind: 'message', threadId: 12, messageId: 12 },
    });
    expect(pendingOpenFromFeedItem(ITEMS[6])).toEqual({
      scope: 'internal',
      companyId: 4,
      target: { kind: 'call', sid: 'c9' },
    });
  });
});

describe('feedRowChrome', () => {
  it('a voicemail keeps the call colour but says Voicemail', () => {
    const call = ITEMS[4];
    const plain = feedRowChrome(call);
    const voicemail = feedRowChrome({ ...call, isVoicemail: true } as UnreadFeedItem);
    expect(plain.label).toBe('Call');
    expect(voicemail.label).toBe('Voicemail');
    // Same event, same channel — only the label and icon change.
    expect(voicemail.dot).toBe(plain.dot);
    expect(voicemail.Icon).not.toBe(plain.Icon);
  });

  /**
   * ⚠️ A voicemail is BOTH, and the order decides which label it gets. If the missed
   * branch ever moves above the voicemail one, every voicemail silently becomes a plain
   * "Missed call" and the more useful of the two labels disappears.
   */
  it('calls a row that is both voicemail and missed a Voicemail', () => {
    const both = {
      ...ITEMS[4],
      isVoicemail: true,
      isMissed: true,
    } as UnreadFeedItem;
    expect(feedRowChrome(both).label).toBe('Voicemail');
  });

  it('labels a plain missed call, and leaves an unread answered one generic', () => {
    const missed = { ...ITEMS[4], isMissed: true } as UnreadFeedItem;
    expect(feedRowChrome(missed).label).toBe('Missed call');
    expect(feedRowChrome(ITEMS[4]).label).toBe('Call');
  });

  it('reads internal rows from the internal style record', () => {
    expect(feedRowChrome(ITEMS[5]).label).toBe('Internal');
  });

  it('resolves chrome for every variant', () => {
    for (const item of ITEMS) {
      const chrome = feedRowChrome(item);
      expect(chrome.label).toBeTruthy();
      expect(chrome.Icon).toBeTruthy();
    }
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');

  it('collapses the last minute to "now"', () => {
    expect(relativeTime('2026-09-10T11:59:30.000Z', now)).toBe('now');
  });

  it('steps through minutes, hours and days', () => {
    expect(relativeTime('2026-09-10T11:57:00.000Z', now)).toBe('3m');
    expect(relativeTime('2026-09-10T08:00:00.000Z', now)).toBe('4h');
    expect(relativeTime('2026-09-08T12:00:00.000Z', now)).toBe('2d');
  });

  it('reads a future timestamp as new rather than negative', () => {
    // Clock skew between us and a provider must not render "-1m".
    expect(relativeTime('2026-09-10T12:00:30.000Z', now)).toBe('now');
  });

  it('falls back to the email formatter past a week', () => {
    expect(relativeTime('2026-08-01T12:00:00.000Z', now)).not.toMatch(/^\d+d$/);
  });

  it('returns empty for junk rather than NaN', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});

describe('badgeLabel', () => {
  it('marks a truncated feed with a plus', () => {
    expect(badgeLabel(50, true)).toBe('50+');
    expect(badgeLabel(50, false)).toBe('50');
  });

  it('caps the display at 99+', () => {
    expect(badgeLabel(120, false)).toBe('99+');
  });
});

describe('isMissedCallRow', () => {
  it('matches only call rows the server flagged, in either scope', () => {
    for (const item of ITEMS) {
      // The fixtures are all unflagged, so nothing qualifies until isMissed is set.
      expect(isMissedCallRow(item)).toBe(false);
    }
    expect(
      isMissedCallRow({ ...ITEMS[4], isMissed: true } as UnreadFeedItem),
    ).toBe(true);
    expect(
      isMissedCallRow({ ...ITEMS[6], isMissed: true } as UnreadFeedItem),
    ).toBe(true);
  });

  it('counts a voicemail — it is a missed call that left a message', () => {
    const voicemail = {
      ...ITEMS[4],
      isVoicemail: true,
      isMissed: true,
    } as UnreadFeedItem;
    expect(isMissedCallRow(voicemail)).toBe(true);
  });

  /**
   * The rule reads the server's flag rather than `title`. `title` is a display string
   * (`callTitle`), and the feed deliberately carries answered-but-unread inbound calls,
   * so matching on it would couple the filter to wording.
   */
  it('ignores a row whose title says Missed call but whose flag does not', () => {
    const liar = {
      ...ITEMS[4],
      title: 'Missed call',
      isMissed: false,
    } as UnreadFeedItem;
    expect(isMissedCallRow(liar)).toBe(false);
  });
});

describe('returnCallTarget', () => {
  /**
   * The gate is "is there something to dial", not "was it missed". Every row in this feed
   * is unread by definition and an answered call is read by construction, so what is left
   * is already missed, failed or a voicemail — and gating on `isMissed` would strand a
   * FAILED inbound call with no way to ring the person back.
   */
  it('offers a company call its E.164 counterparty and its company', () => {
    const call = ITEMS.find((i) => i.id === 'swcall:c1')!;
    expect(returnCallTarget(call)).toEqual({
      scope: 'company',
      companyId: call.companyId,
      to: '+14385551212',
    });
  });

  it('offers a staff call a USER id — there is no number in its path', () => {
    const call = ITEMS.find((i) => i.id === 'intcall:c9')!;
    expect(returnCallTarget(call)).toEqual({ scope: 'internal', calleeId: 7 });
  });

  it('offers nothing when the caller withheld a number', () => {
    const call = ITEMS.find((i) => i.id === 'swcall:c1')!;
    expect(returnCallTarget({ ...call, peer: null } as UnreadFeedItem)).toBeNull();
  });

  it('offers nothing on a row that is not a call', () => {
    for (const item of ITEMS.filter((i) => i.kind !== 'call')) {
      expect(returnCallTarget(item)).toBeNull();
    }
  });
});

/**
 * The header NUMBER, not just the row.
 *
 * `unreadFeedDismiss` hides a row; it cannot touch a server scalar. So marking a missed
 * call read left the pill and the browser-tab badge showing the old figure until a
 * refetch landed — "Showing 0 of 1", with the pill still lit.
 */
describe('adjustMissedForDismissed', () => {
  const missedCall = (over: Partial<UnreadFeedItem> = {}): UnreadFeedItem =>
    ({
      ...base,
      id: 'swcall:m1',
      scope: 'company',
      kind: 'call',
      sid: 'm1',
      itemId: 'swcall:m1',
      peer: '+14385551212',
      isVoicemail: false,
      isMissed: true,
      ...over,
    }) as UnreadFeedItem;

  const run = (
    rawUnread: UnreadFeedItem[],
    dismissed: string[],
    missedCalls: Record<number, number> | undefined,
    missedCallsOwn: number,
  ) =>
    adjustMissedForDismissed({
      rawUnread,
      missedCalls,
      missedCallsOwn,
      dismissed: new Set(dismissed),
    });

  it('decrements both the company entry and the own-total', () => {
    const out = run([missedCall()], ['swcall:m1'], { 4: 3 }, 3);
    expect(out.missedCalls).toEqual({ 4: 2 });
    expect(out.missedCallsOwn).toBe(2);
  });

  it('ignores a dismissed row that is not a missed call', () => {
    const answered = missedCall({ id: 'swcall:a1', isMissed: false });
    const out = run([answered], ['swcall:a1'], { 4: 3 }, 3);
    expect(out.missedCalls).toEqual({ 4: 3 });
    expect(out.missedCallsOwn).toBe(3);
  });

  it('handles an internal missed call the same way', () => {
    // The reported case: a staff call marked read from the pill itself.
    const internal = missedCall({
      id: 'intcall:c9',
      scope: 'internal',
      companyId: 77,
    });
    const out = run([internal], ['intcall:c9'], { 77: 1 }, 1);
    expect(out.missedCalls).toEqual({ 77: 0 });
    expect(out.missedCallsOwn).toBe(0);
  });

  it('does NOT create a company key the server never reported', () => {
    // Absent means UNKNOWN, deliberately distinct from 0 — CompanyRow renders no badge
    // for a missing key, and inventing a 0 would assert something the server did not.
    const out = run([missedCall()], ['swcall:m1'], { 9: 2 }, 5);
    expect(out.missedCalls).toEqual({ 9: 2 });
    expect('4' in (out.missedCalls ?? {})).toBe(false);
    expect(out.missedCallsOwn).toBe(4);
  });

  it('clamps at zero rather than rendering a negative badge', () => {
    const out = run(
      [missedCall(), missedCall({ id: 'swcall:m2' })],
      ['swcall:m1', 'swcall:m2'],
      { 4: 1 },
      1,
    );
    expect(out.missedCalls).toEqual({ 4: 0 });
    expect(out.missedCallsOwn).toBe(0);
  });

  it('⚠️ stops adjusting once the server has dropped the row — never double-subtracts', () => {
    // THE property the whole design rests on. The adjustment is derived from rows still
    // present in the payload, so a caught-up server (row gone, count already 2) is left
    // exactly as it is, even though the id is still in the dismiss store for 5 minutes.
    const out = run([], ['swcall:m1'], { 4: 2 }, 2);
    expect(out.missedCalls).toEqual({ 4: 2 });
    expect(out.missedCallsOwn).toBe(2);
  });

  it('is a no-op when nothing is dismissed, and keeps the same object', () => {
    const missedCalls = { 4: 3 };
    const out = run([missedCall()], [], missedCalls, 3);
    expect(out.missedCalls).toBe(missedCalls);
    expect(out.missedCallsOwn).toBe(3);
  });

  it('survives an undefined map — absent is not zero', () => {
    const out = run([missedCall()], ['swcall:m1'], undefined, 1);
    expect(out.missedCalls).toBeUndefined();
    expect(out.missedCallsOwn).toBe(0);
  });
});
