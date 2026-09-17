import { describe, expect, it } from 'vitest';
import { isImplicitlyReadInternalCall } from './internal-inbox';
import type { InternalCall } from '@/api/internalCalls';

/**
 * The client half of a rule that lives twice. If this disagrees with
 * `isImplicitlyReadInternalCall` in server `internal-calls/internal-call-read.util.ts`,
 * the read/unread control reappears on a row where pressing it does nothing: the mark
 * flips optimistically and bounces back on the next poll, because read state is "a row
 * exists ⇔ read" with no way to record that it was later cleared.
 */
function call(over: Partial<InternalCall> = {}): InternalCall {
  return {
    id: 'intcall:sid-1',
    sid: 'sid-1',
    direction: 'inbound',
    peer: { id: 9, name: 'David Levy' },
    at: '2026-09-01T10:00:00.000Z',
    durationSec: 42,
    status: 'completed',
    outcome: 'answered',
    isRead: true,
    isCompleted: false,
    hasRecording: false,
    ...over,
  };
}

describe('isImplicitlyReadInternalCall', () => {
  it('reads every call you placed, whatever came of it', () => {
    for (const outcome of ['answered', 'missed', 'in-progress'] as const) {
      expect(
        isImplicitlyReadInternalCall(call({ direction: 'outbound', outcome })),
      ).toBe(true);
    }
  });

  it('reads an incoming call you answered', () => {
    // The reported bug: an answered staff call arrived unread and sat in the bell.
    expect(isImplicitlyReadInternalCall(call({ outcome: 'answered' }))).toBe(true);
  });

  it('reads a call that is still up', () => {
    expect(isImplicitlyReadInternalCall(call({ outcome: 'in-progress' }))).toBe(true);
  });

  it('leaves a missed incoming call UNREAD, so it still nags', () => {
    expect(isImplicitlyReadInternalCall(call({ outcome: 'missed' }))).toBe(false);
  });
});
