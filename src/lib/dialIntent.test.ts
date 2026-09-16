import { beforeEach, describe, expect, it } from 'vitest';
import { DIAL_INTENT_MS, clearDialIntent, dialedHere, markDialedHere } from './dialIntent';

describe('dialIntent', () => {
  beforeEach(clearDialIntent);

  it('is false before anything has been dialled', () => {
    // The default matters: a freshly opened tab must never claim somebody else's leg.
    expect(dialedHere()).toBe(false);
  });

  it('is true immediately after a dial', () => {
    markDialedHere(1_000);
    expect(dialedHere(1_000)).toBe(true);
  });

  it('stays true across the whole window', () => {
    markDialedHere(1_000);
    expect(dialedHere(1_000 + DIAL_INTENT_MS)).toBe(true);
  });

  it('expires past it', () => {
    markDialedHere(1_000);
    expect(dialedHere(1_000 + DIAL_INTENT_MS + 1)).toBe(false);
  });

  it('a later dial extends the window', () => {
    markDialedHere(1_000);
    markDialedHere(50_000);
    expect(dialedHere(100_000)).toBe(true);
  });
});
