import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKSTOP_MS,
  backstopMs,
  isRealtimeConnected,
  setRealtimeConnected,
} from './realtime-status';

describe('realtime-status', () => {
  afterEach(() => setRealtimeConnected(false));

  it('polls at the normal rate while the channel is down', () => {
    expect(backstopMs(15_000, false)).toBe(15_000);
  });

  it('drops every poll to the backstop while the channel is up', () => {
    expect(backstopMs(3_000, true)).toBe(BACKSTOP_MS);
    expect(backstopMs(60_000, true)).toBe(BACKSTOP_MS);
  });

  it('never makes a slow poll FASTER', () => {
    expect(backstopMs(10 * 60_000, true)).toBe(10 * 60_000);
  });

  it('tracks the flag', () => {
    setRealtimeConnected(true);
    expect(isRealtimeConnected()).toBe(true);
    setRealtimeConnected(false);
    expect(isRealtimeConnected()).toBe(false);
  });
});
