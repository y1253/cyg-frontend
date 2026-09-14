import { describe, expect, it } from 'vitest';
import {
  CW_BURSTS,
  CW_CYCLE,
  CW_HZ,
  CW_TOTAL_SECONDS,
  callWaitingSchedule,
} from './call-waiting-tone';
import {
  RING_CYCLE,
  TRILL_HIGH_HZ,
  TRILL_LOW_HZ,
  ringSchedule,
} from './ringtone';

describe('callWaitingSchedule', () => {
  const bursts = callWaitingSchedule();

  it('pips twice and then stays quiet until the next cycle', () => {
    expect(bursts[0].on).toBeCloseTo(0);
    expect(bursts[0].off).toBeCloseTo(0.2);
    expect(bursts[1].on).toBeCloseTo(0.34);
    expect(bursts[1].off).toBeCloseTo(0.54);
    expect(bursts[2].on).toBeCloseTo(CW_CYCLE);
  });

  it('stops within the total, and never starts a pip past the end', () => {
    expect(bursts).toHaveLength(
      Math.ceil(CW_TOTAL_SECONDS / CW_CYCLE) * CW_BURSTS.length,
    );
    for (const burst of bursts) {
      expect(burst.on).toBeLessThan(CW_TOTAL_SECONDS);
      expect(burst.off).toBeLessThanOrEqual(CW_TOTAL_SECONDS);
    }
  });

  it('never overlaps two pips, and never ends one before it starts', () => {
    for (let i = 0; i < bursts.length; i++) {
      expect(bursts[i].off).toBeGreaterThan(bursts[i].on);
      if (i > 0) expect(bursts[i].on).toBeGreaterThan(bursts[i - 1].off);
    }
  });

  it('gives up before the ringtone does', () => {
    // Past the <Dial timeout="30"> the caller is in voicemail. Pipping at the agent for a
    // call that no longer exists is worse than not pipping at all.
    expect(CW_TOTAL_SECONDS).toBeLessThan(60);
    expect(CW_TOTAL_SECONDS).toBeGreaterThan(30);
  });
});

describe('it cannot be mistaken for either sound the agent already knows', () => {
  it('is not the ringback tone an outbound call plays', () => {
    expect(CW_HZ).not.toBe(440);
    expect(CW_HZ).not.toBe(480);
  });

  it('is not the incoming-call ringtone', () => {
    // Different pitch AND different rhythm — either alone would be a coin flip in a noisy
    // office, and this one has to be recognised mid-conversation.
    expect(CW_HZ).toBeGreaterThan(TRILL_HIGH_HZ);
    expect(CW_HZ).not.toBe(TRILL_LOW_HZ);
    expect(CW_CYCLE).toBeGreaterThan(RING_CYCLE * 2);
  });

  it('occupies far less of the agent’s ear than the ringtone', () => {
    // It plays OVER a live conversation, so duty cycle is the thing that matters.
    const duty = (schedule: { on: number; off: number }[], total: number) =>
      schedule.reduce((sum, b) => sum + (b.off - b.on), 0) / total;
    expect(duty(callWaitingSchedule(), CW_TOTAL_SECONDS)).toBeLessThan(
      duty(ringSchedule(), 60) / 4,
    );
  });
});
