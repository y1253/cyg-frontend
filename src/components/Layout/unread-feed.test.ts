import { describe, expect, it } from 'vitest';
import {
  badgeLabel,
  feedRowChrome,
  pendingOpenFromFeedItem,
  readIdForSelection,
  relativeTime,
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
    isVoicemail: false,
  },
  {
    ...base,
    id: 'intmsg:12',
    scope: 'internal',
    kind: 'message',
    messageId: 12,
    threadId: 12,
  },
  { ...base, id: 'intcall:c9', scope: 'internal', kind: 'call', sid: 'c9' },
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
    ]);
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
