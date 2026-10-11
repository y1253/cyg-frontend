import { describe, expect, it } from 'vitest';
import { HOLD_MS, shouldRepin } from './useHoldAnchorInView';

const base = {
  elapsedMs: 500,
  userInteracted: false,
  armedFor: 'wa:42',
  anchorId: 'wa:42',
};

describe('shouldRepin', () => {
  it('re-pins while pictures above the anchor are still loading', () => {
    expect(shouldRepin(base)).toBe(true);
  });

  it('never takes the page back from somebody who is scrolling', () => {
    expect(shouldRepin({ ...base, userInteracted: true })).toBe(false);
  });

  it('stops once the hold window is over', () => {
    expect(shouldRepin({ ...base, elapsedMs: HOLD_MS })).toBe(false);
  });

  it('does nothing for an anchor it was not armed for', () => {
    expect(shouldRepin({ ...base, anchorId: 'wa:43' })).toBe(false);
    expect(shouldRepin({ ...base, armedFor: null })).toBe(false);
  });
});
