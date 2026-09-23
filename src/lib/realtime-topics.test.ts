import { describe, expect, it } from 'vitest';
import { RESET_KEYS, keysFor } from './realtime-topics';
import { callEventOf } from '@/api/realtime';
import type { RealtimeEvent, RealtimeTopic } from '@/api/realtime';

const ev = (topic: RealtimeTopic, companyId?: number): RealtimeEvent => ({
  seq: 1,
  at: Date.now(),
  topic,
  ...(companyId === undefined ? {} : { companyId }),
});

const flat = (keys: unknown[][]) => keys.map((k) => k.join(':'));

describe('keysFor', () => {
  it('refreshes the active-call query under its REAL key', () => {
    // The regression this whole table exists to make impossible: `SoftphoneContext`
    // invalidated `['active-call', id]` for months while `useActiveCall` registered
    // `['phone-active-call', id]`, so hanging up refreshed nothing the agent could see.
    expect(flat(keysFor(ev('call-ended', 7)))).toContain('phone-active-call:7');
    expect(flat(keysFor(ev('active-call', 7)))).toContain('phone-active-call:7');
    expect(flat(keysFor(ev('call-ended', 7)))).not.toContain('active-call:7');
  });

  it('moves the badges on a finished call, not just the row', () => {
    const keys = flat(keysFor(ev('call-ended', 7)));
    // `inbox-summary` is the bell, the dashboard badges and the browser tab icon.
    expect(keys).toContain('inbox-summary');
    expect(keys).toContain('phone-counts:7');
    expect(keys).toContain('phone-timeline:7');
  });

  it('does NOT move the badges on mid-call progress', () => {
    // Nothing has been read, completed or ended, so a count cannot have changed.
    // Invalidating them here would put the dashboard's whole sweep on every ringing
    // callback of every call.
    expect(flat(keysFor(ev('phone', 7)))).toEqual(['phone-timeline:7']);
  });

  it('treats an inbound text and an inbound WhatsApp message as new unread work', () => {
    // Both were invisible to the bell before the channel existed -- SMS busted the
    // timeline only, and WhatsApp signalled nothing at all.
    expect(flat(keysFor(ev('sms', 3)))).toContain('inbox-summary');
    expect(flat(keysFor(ev('whatsapp', 3)))).toContain('inbox-summary');
  });

  it('keys the per-user topics without a company', () => {
    // The workspace inbox is one list, not one per company -- a company id on these
    // would silently produce keys that match no query.
    const internal = flat(keysFor(ev('internal-message')));
    expect(internal).toContain('internal-messages');
    expect(internal).toContain('inbox-summary');
    expect(internal.every((k) => !k.includes(':'))).toBe(true);
  });

  it('emits nothing company-scoped when the event carries no company', () => {
    // An event that should have had a company and does not must refresh NOTHING rather
    // than produce `['phone-timeline', undefined]`, which matches every company at once.
    expect(keysFor(ev('call-ended'))).toEqual([
      ['inbox-summary'],
      ['internal-calls'],
      ['internal-call-counts'],
    ]);
    expect(keysFor(ev('phone'))).toEqual([]);
  });

  it('covers every topic', () => {
    const topics: RealtimeTopic[] = [
      'call-ended',
      'phone',
      'phone-state',
      'active-call',
      'ringing',
      'sms',
      'whatsapp',
      'email',
      'internal-message',
      'internal-call',
      'presence',
    ];
    for (const t of topics) {
      expect(() => keysFor(ev(t, 1))).not.toThrow();
      expect(keysFor(ev(t, 1)).length).toBeGreaterThan(0);
    }
  });

  it('refreshes a mailbox of either provider off one topic', () => {
    // Outlook has no push of its own and rides the gmail-named query keys, so this is
    // what gives it any real-time behaviour at all.
    expect(flat(keysFor(ev('email', 5)))).toContain('gmail-emails:5');
  });
});

describe('RESET_KEYS', () => {
  it('covers the surfaces a missed batch could have changed', () => {
    const keys = flat(RESET_KEYS);
    expect(keys).toContain('inbox-summary');
    expect(keys).toContain('internal-messages');
    expect(keys).toContain('phone-timeline');
  });

  it('is prefix-only, so it matches every company', () => {
    // A reset means the specific events are GONE, so it cannot name ids.
    expect(RESET_KEYS.every((k) => k.length === 1)).toBe(true);
  });
});

describe('callEventOf', () => {
  it('returns the call for a ringing event', () => {
    const call = callEventOf({
      seq: 1,
      at: 0,
      topic: 'ringing',
      payload: { callSid: 'abc', companyId: 4, companyName: 'X', from: '+1' },
    });
    expect(call?.callSid).toBe('abc');
  });

  it('ignores every other topic, whatever it carries', () => {
    expect(
      callEventOf({
        seq: 1,
        at: 0,
        topic: 'sms',
        payload: { callSid: 'abc', companyId: 4 },
      }),
    ).toBeNull();
  });

  it('drops a payload missing what pairing needs, rather than pairing badly', () => {
    // No callSid means nothing to match an INVITE against; no companyId means the
    // overlay has nowhere to navigate. The `/pending-calls` burst still covers the call.
    expect(
      callEventOf({ seq: 1, at: 0, topic: 'ringing', payload: { companyId: 4 } }),
    ).toBeNull();
    expect(
      callEventOf({ seq: 1, at: 0, topic: 'ringing', payload: { callSid: 'a' } }),
    ).toBeNull();
    expect(callEventOf({ seq: 1, at: 0, topic: 'ringing' })).toBeNull();
  });
});
