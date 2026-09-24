import { describe, expect, it, vi, afterEach } from 'vitest';
import { endedReportFor, type EndedReportSlot } from './ended-report';

function callee(answeredAt: number | null): EndedReportSlot {
  return { answeredAt, info: { token: 'tok-abc' } };
}

function caller(answeredAt: number | null): EndedReportSlot {
  return { answeredAt, info: {} };
}

afterEach(() => vi.useRealTimers());

describe('endedReportFor', () => {
  it('reports nothing from a callee tab that was CANCELled while still ringing', () => {
    // THE REPORTED BUG. Two tabs of one user both ring; one answers, SignalWire CANCELs
    // the other. The loser used to say `no-answer`/0 at the exact moment of the answer,
    // which the server counted as settled — so the tab that really answered was refused
    // and the call read MISSED forever.
    expect(endedReportFor(callee(null))).toBeNull();
  });

  it('reports the talk time from the callee tab that actually answered', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:30Z'));
    const answeredAt = new Date('2026-09-24T12:00:00Z').getTime();

    expect(endedReportFor(callee(answeredAt))).toEqual({
      answered: true,
      durationSec: 30,
    });
  });

  it('never reports ANSWERED from the caller, however long its own leg was up', () => {
    // The caller's leg auto-accepts, so it is Established for the whole ring and its
    // `answeredAt` measures the RING, not the conversation. Reporting it would file a
    // call nobody picked up as answered, with the ring time as its duration.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:25Z'));
    const answeredAt = new Date('2026-09-24T12:00:00Z').getTime();

    expect(endedReportFor(caller(answeredAt))).toEqual({
      answered: false,
      durationSec: 0,
    });
  });

  it('still lets the caller report that the call is over', () => {
    // The caller's ROOT leg ending really does end the call, and it is the one case
    // `settleFromDial` cannot see — SignalWire does not request the `<Dial action>` URL
    // when the leg running the `<Dial>` is the one that hung up.
    expect(endedReportFor(caller(null))).toEqual({
      answered: false,
      durationSec: 0,
    });
  });

  it('never reports a negative duration if the clock steps backwards', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
    const answeredAt = new Date('2026-09-24T12:00:10Z').getTime();

    expect(endedReportFor(callee(answeredAt))).toEqual({
      answered: true,
      durationSec: 0,
    });
  });
});
