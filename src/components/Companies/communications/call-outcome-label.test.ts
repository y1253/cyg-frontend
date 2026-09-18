import { describe, expect, it } from 'vitest';
import {
  callOutcomeLabel,
  isAlarmingOutcome,
  type CallOutcome,
} from './types';

const OUTCOMES: CallOutcome[] = ['answered', 'missed', 'failed', 'in-progress'];

describe('callOutcomeLabel', () => {
  it('calls an unanswered INBOUND call missed', () => {
    // Somebody tried to reach us and we were not there — the backlog item.
    expect(callOutcomeLabel('missed', 'inbound')).toBe('Missed');
  });

  it('calls an unanswered OUTBOUND call "No answer", never missed', () => {
    // The reported bug. A call WE placed that rang out is not a missed call, and the
    // detail card used to say "Missed" beside a "Direction: Outgoing" row.
    expect(callOutcomeLabel('missed', 'outbound')).toBe('No answer');
    expect(callOutcomeLabel('missed', 'outbound')).not.toMatch(/missed/i);
  });

  it('leaves every other outcome identical in both directions', () => {
    // Only `missed` is direction-sensitive; widening that would be a silent relabelling.
    for (const outcome of OUTCOMES.filter((o) => o !== 'missed')) {
      expect(callOutcomeLabel(outcome, 'inbound')).toBe(
        callOutcomeLabel(outcome, 'outbound'),
      );
    }
  });

  it('gives every outcome a non-empty label in both directions', () => {
    for (const outcome of OUTCOMES) {
      for (const direction of ['inbound', 'outbound'] as const) {
        expect(callOutcomeLabel(outcome, direction)).toBeTruthy();
      }
    }
  });
});

describe('isAlarmingOutcome', () => {
  it('never alarms on a call we placed', () => {
    // Red here means "somebody is waiting on you". An outbound call that rang out is your
    // own action to retry, and it is excluded from every missed-call count by direction —
    // so red would be the one place left still calling it a backlog item.
    for (const outcome of OUTCOMES) {
      expect(isAlarmingOutcome(outcome, 'outbound')).toBe(false);
    }
  });

  it('alarms on an inbound call that was missed or failed', () => {
    expect(isAlarmingOutcome('missed', 'inbound')).toBe(true);
    expect(isAlarmingOutcome('failed', 'inbound')).toBe(true);
  });

  it('does not alarm on an inbound call that went fine', () => {
    expect(isAlarmingOutcome('answered', 'inbound')).toBe(false);
    expect(isAlarmingOutcome('in-progress', 'inbound')).toBe(false);
  });
});
