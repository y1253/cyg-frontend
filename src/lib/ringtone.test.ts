import { describe, expect, it } from 'vitest';
import {
  RING_BURSTS,
  RING_CYCLE,
  RING_TOTAL_SECONDS,
  TRILL_HIGH_HZ,
  TRILL_LOW_HZ,
  TRILL_RATE_HZ,
  ringSchedule,
} from './ringtone';

describe('ringSchedule', () => {
  const bursts = ringSchedule();

  it('rings "ring-ring" and then stays silent until the next cycle', () => {
    expect(bursts[0].on).toBeCloseTo(0);
    expect(bursts[0].off).toBeCloseTo(0.4);
    expect(bursts[1].on).toBeCloseTo(0.6);
    expect(bursts[1].off).toBeCloseTo(1.0);
    expect(bursts[2].on).toBeCloseTo(RING_CYCLE);
  });

  it('rings for the whole duration, two bursts per cycle, and then stops', () => {
    const cycles = Math.floor(RING_TOTAL_SECONDS / RING_CYCLE);
    expect(bursts).toHaveLength(cycles * RING_BURSTS.length);
    expect(bursts[bursts.length - 1].off).toBeLessThanOrEqual(RING_TOTAL_SECONDS);
  });

  it('never overlaps two bursts, and never has a burst end before it starts', () => {
    for (let i = 0; i < bursts.length; i++) {
      expect(bursts[i].off).toBeGreaterThan(bursts[i].on);
      if (i > 0) expect(bursts[i].on).toBeGreaterThan(bursts[i - 1].off);
    }
  });
});

describe('the trill', () => {
  it('is not the ringback tone an outbound call plays', () => {
    // The whole reason this file exists: 440+480 Hz is the network's ringback, which the
    // agent already hears while an outbound call rings.
    expect([TRILL_LOW_HZ, TRILL_HIGH_HZ]).not.toContain(440);
    expect([TRILL_LOW_HZ, TRILL_HIGH_HZ]).not.toContain(480);
  });

  it('alternates fast enough to sound like a bell rather than two separate notes', () => {
    expect(TRILL_HIGH_HZ).toBeGreaterThan(TRILL_LOW_HZ);
    expect(TRILL_RATE_HZ).toBeGreaterThanOrEqual(15);
  });
});
