import { describe, expect, it } from 'vitest';
import { idleRemainingMs, shouldWriteActivity } from './idle-timer';

const HOUR = 60 * 60_000;

describe('idleRemainingMs', () => {
  it('counts down from the newest activity of any tab', () => {
    expect(idleRemainingMs('1000', 1000 + 10 * 60_000, HOUR)).toBe(50 * 60_000);
  });
  it('is 0 once the whole window passed', () => {
    expect(idleRemainingMs('1000', 1000 + HOUR, HOUR)).toBe(0);
    expect(idleRemainingMs('1000', 1000 + 2 * HOUR, HOUR)).toBe(0);
  });
  it('treats a missing or broken value as expired', () => {
    expect(idleRemainingMs(null, 5, HOUR)).toBe(0);
    expect(idleRemainingMs('abc', 5, HOUR)).toBe(0);
  });
  it('never waits longer than the window (a value from the future)', () => {
    expect(idleRemainingMs(String(10 * HOUR), 0, HOUR)).toBe(HOUR);
  });
});

describe('shouldWriteActivity', () => {
  it('throttles to once per 5s', () => {
    expect(shouldWriteActivity(0, 4_999)).toBe(false);
    expect(shouldWriteActivity(0, 5_000)).toBe(true);
  });
  it('writes after a clock jump backwards', () => {
    expect(shouldWriteActivity(10_000, 1_000)).toBe(true);
  });
});
