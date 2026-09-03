import { describe, it, expect } from 'vitest';
import { matchesKindFilter, KIND_FILTER_LABELS } from './types';
import type { UnifiedItem } from './types';
import type { CallItem, SmsItem } from '@/api/phone';

/**
 * `'voicemail'` is a PSEUDO-KIND: the rows it selects are still `kind: 'call'`.
 *
 * The filter used to be one expression, `it.kind !== filter`, which is correct for every
 * real `ItemKind` and silently matches nothing for this one — a Voicemail option that
 * empties the inbox rather than narrowing it, with no error anywhere.
 */

const callItem = (over: Partial<CallItem> = {}): UnifiedItem => ({
  kind: 'call',
  data: {
    id: 'swcall:1',
    sid: '1',
    kind: 'call',
    direction: 'inbound',
    counterparty: '+15145550001',
    supportNumber: '+14382561210',
    status: 'completed',
    outcome: 'missed',
    durationSec: 0,
    hasRecording: true,
    hasVoicemail: true,
    parentCallSid: null,
    at: '2026-09-01T10:00:00.000Z',
    isRead: false,
    isCompleted: false,
    ...over,
  } as CallItem,
});

const smsItem = (): UnifiedItem => ({
  kind: 'sms',
  data: {
    id: 'swsms:1',
    sid: '1',
    kind: 'sms',
    direction: 'inbound',
    counterparty: '+15145550001',
    supportNumber: '+14382561210',
    status: 'received',
    body: 'hi',
    numMedia: 0,
    errorCode: null,
    at: '2026-09-01T10:00:00.000Z',
    isRead: false,
    isCompleted: false,
  } as SmsItem,
});

describe('matchesKindFilter', () => {
  it('keeps everything under "all"', () => {
    expect(matchesKindFilter(callItem(), 'all')).toBe(true);
    expect(matchesKindFilter(smsItem(), 'all')).toBe(true);
  });

  it('matches a real kind by kind', () => {
    expect(matchesKindFilter(smsItem(), 'sms')).toBe(true);
    expect(matchesKindFilter(smsItem(), 'call')).toBe(false);
    expect(matchesKindFilter(callItem(), 'call')).toBe(true);
  });

  // The whole reason this function exists.
  it('matches a voicemail even though its kind is "call"', () => {
    expect(matchesKindFilter(callItem(), 'voicemail')).toBe(true);
  });

  it('excludes an ordinary call from the voicemail filter', () => {
    const plain = callItem({ outcome: 'answered', hasVoicemail: false });
    expect(matchesKindFilter(plain, 'voicemail')).toBe(false);
    // …but it is still a call, so the Calls filter keeps it.
    expect(matchesKindFilter(plain, 'call')).toBe(true);
  });

  // A voicemail must stay in the Calls filter too. It is one event, not two rows, so
  // narrowing to Calls and losing the voicemails would hide the missed calls that
  // matter most.
  it('keeps a voicemail under the Calls filter as well', () => {
    expect(matchesKindFilter(callItem(), 'call')).toBe(true);
  });

  it('never matches a non-call under the voicemail filter', () => {
    expect(matchesKindFilter(smsItem(), 'voicemail')).toBe(false);
  });

  it('offers a label for every filter it can be given', () => {
    // The Select renders Object.entries(KIND_FILTER_LABELS), so a filter with no label
    // is a value the user can never pick back off again.
    for (const key of ['all', 'email', 'chat', 'call', 'sms', 'voicemail']) {
      expect(KIND_FILTER_LABELS[key]).toBeTruthy();
    }
  });
});
