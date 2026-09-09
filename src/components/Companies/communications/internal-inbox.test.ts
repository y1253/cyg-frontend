import { describe, it, expect } from 'vitest';
import {
  getInternalItemTimestamp,
  internalItemId,
  matchesInternalItem,
  type InternalItem,
} from './internal-inbox';
import { clampSources } from './inbox-clamp';
import type { InternalMessageSummary } from '@/api/internalMessages';
import type { InternalCall } from '@/api/internalCalls';

const USER = { id: 1, name: 'Dana Levy', email: 'dana@cygfinance.com' };

function msg(over: Partial<InternalMessageSummary> = {}): InternalItem {
  return {
    kind: 'message',
    data: {
      id: 1,
      threadId: 1,
      parentId: null,
      subject: 'Q3 filings',
      date: '2026-09-01T10:00:00.000Z',
      snippet: 'here are the',
      isOwn: false,
      isForward: false,
      isRead: false,
      isCompleted: false,
      from: USER,
      to: [],
      cc: [],
      bcc: [],
      attachments: [],
      ...over,
    },
  };
}

function call(over: Partial<InternalCall> = {}): InternalItem {
  return {
    kind: 'call',
    data: {
      id: 'intcall:abc',
      sid: 'abc',
      direction: 'inbound',
      peer: { id: 2, name: 'Ari Cohen' },
      at: '2026-09-01T11:00:00.000Z',
      durationSec: 42,
      status: 'completed',
      outcome: 'answered',
      isRead: false,
      isCompleted: false,
      hasRecording: false,
      ...over,
    },
  };
}

describe('getInternalItemTimestamp', () => {
  /**
   * The two field names genuinely differ — a message mirrors Gmail's `date`, a call
   * mirrors the phone timeline's `at`. A single `data.at` read would return `undefined`
   * for every message, which parses to 0 and silently disables the watermark clamp.
   */
  it('reads `date` off a message and `at` off a call', () => {
    expect(getInternalItemTimestamp(msg())).toBe(
      Date.parse('2026-09-01T10:00:00.000Z'),
    );
    expect(getInternalItemTimestamp(call())).toBe(
      Date.parse('2026-09-01T11:00:00.000Z'),
    );
  });

  it('never returns NaN for an unparseable timestamp', () => {
    // NaN would poison the sort comparator; 0 is at least an ordering.
    expect(getInternalItemTimestamp(msg({ date: 'not a date' }))).toBe(0);
  });
});

describe('internalItemId', () => {
  // A message id is a number and a call sid is a bare uuid, so one shared Set would
  // eventually collide without a prefix.
  it('namespaces both kinds into one string space', () => {
    expect(internalItemId(msg({ id: 12 }))).toBe('intmsg:12');
    expect(internalItemId(call({ id: 'intcall:abc' }))).toBe('intcall:abc');
    expect(internalItemId(msg({ id: 12 }))).not.toBe(
      internalItemId(call({ id: 'intcall:12' })),
    );
  });
});

describe('matchesInternalItem', () => {
  it('narrows to one kind', () => {
    expect(matchesInternalItem(msg(), { filter: 'call' })).toBe(false);
    expect(matchesInternalItem(call(), { filter: 'call' })).toBe(true);
    expect(matchesInternalItem(msg(), { filter: 'all' })).toBe(true);
  });

  /**
   * Messages are searched server-side, so anything that came back already matched and
   * must not be re-tested here — re-testing would drop a body-only hit whose subject
   * does not contain the term.
   */
  it('leaves a returned message alone while filtering calls by peer name', () => {
    expect(matchesInternalItem(msg(), { filter: 'all', search: 'zzz' })).toBe(
      true,
    );
    expect(matchesInternalItem(call(), { filter: 'all', search: 'ari' })).toBe(
      true,
    );
    expect(matchesInternalItem(call(), { filter: 'all', search: 'zzz' })).toBe(
      false,
    );
  });

  it('drops calls under a structured search, which has no field they carry', () => {
    expect(
      matchesInternalItem(call(), { filter: 'all', structuredSearch: true }),
    ).toBe(false);
    expect(
      matchesInternalItem(msg(), { filter: 'all', structuredSearch: true }),
    ).toBe(true);
  });
});

describe('clampSources over the internal inbox', () => {
  const older = call({ id: 'intcall:old', at: '2026-08-01T00:00:00.000Z' });
  const newer = msg({ id: 2, date: '2026-09-05T00:00:00.000Z' });
  const oldestMsg = msg({ id: 3, date: '2026-09-02T00:00:00.000Z' });

  it('hides a call older than the pinning source tail', () => {
    const out = clampSources<'message' | 'call', InternalItem>(
      [
        {
          kind: 'message',
          items: [newer, oldestMsg],
          hasNext: true,
          enabled: true,
        },
        { kind: 'call', items: [older], hasNext: false, enabled: true },
      ],
      getInternalItemTimestamp,
    );
    expect(out.visible).toEqual([newer, oldestMsg]);
    expect(out.hiddenCount).toBe(1);
    expect(out.clampSource).toBe('message');
  });

  it('shows everything once the paging source is exhausted', () => {
    const out = clampSources<'message' | 'call', InternalItem>(
      [
        {
          kind: 'message',
          items: [newer, oldestMsg],
          hasNext: false,
          enabled: true,
        },
        { kind: 'call', items: [older], hasNext: false, enabled: true },
      ],
      getInternalItemTimestamp,
    );
    expect(out.visible).toEqual([newer, oldestMsg, older]);
    expect(out.clampSource).toBeNull();
  });

  /**
   * A source that has not answered yet reports `hasNext: false`, so it cannot pin — which
   * is what makes rendering the list before it arrives safe rather than out of order.
   */
  it('lets an empty not-yet-loaded source render the rest', () => {
    const out = clampSources<'message' | 'call', InternalItem>(
      [
        { kind: 'message', items: [newer], hasNext: false, enabled: true },
        { kind: 'call', items: [], hasNext: false, enabled: true },
      ],
      getInternalItemTimestamp,
    );
    expect(out.visible).toEqual([newer]);
  });
});
