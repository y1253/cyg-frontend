import { describe, expect, it } from 'vitest';
import type { CallItem, SmsItem } from '@/api/phone';
import { isImplicitlyRead, type UnifiedItem } from './types';

/**
 * Mirrors `isImplicitlyReadCall` in server `phone/phone-timeline.util.ts`.
 *
 * The server stamps `isRead`; this copy decides whether the "Mark as unread" control is
 * offered at all. A disagreement puts the control back on a row where pressing it flips
 * optimistically and bounces back on the next refetch — which is what it looked like
 * before either existed.
 */
const call = (over: Partial<CallItem> = {}): UnifiedItem => ({
  kind: 'call',
  data: {
    direction: 'inbound',
    outcome: 'missed',
    isRead: false,
    hasVoicemail: false,
    ...over,
  } as CallItem,
});

const text = (over: Partial<SmsItem> = {}): UnifiedItem => ({
  kind: 'sms',
  data: { direction: 'inbound', isRead: false, ...over } as SmsItem,
});

describe('isImplicitlyRead', () => {
  it('locks every outbound call, whatever became of it', () => {
    for (const outcome of ['answered', 'missed', 'failed', 'in-progress'] as const) {
      expect(isImplicitlyRead(call({ direction: 'outbound', outcome }))).toBe(true);
    }
  });

  it('locks an inbound call somebody answered, and one still up', () => {
    expect(isImplicitlyRead(call({ outcome: 'answered' }))).toBe(true);
    expect(isImplicitlyRead(call({ outcome: 'in-progress' }))).toBe(true);
  });

  it('leaves a missed call markable — it is still the backlog', () => {
    expect(isImplicitlyRead(call({ outcome: 'missed' }))).toBe(false);
    expect(isImplicitlyRead(call({ outcome: 'failed' }))).toBe(false);
  });

  it('leaves a VOICEMAIL markable', () => {
    expect(isImplicitlyRead(call({ outcome: 'missed', hasVoicemail: true }))).toBe(false);
  });

  it('locks an outbound text but not an inbound one', () => {
    expect(isImplicitlyRead(text({ direction: 'outbound' }))).toBe(true);
    expect(isImplicitlyRead(text())).toBe(false);
  });
});
