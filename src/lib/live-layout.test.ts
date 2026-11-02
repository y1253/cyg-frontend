import { describe, expect, it } from 'vitest';
import { clampSplit, DEFAULT_LAYOUT, parseLayout, splitAt } from './live-layout';

describe('live layout (step11.md)', () => {
  it('keeps the split between 45% and 85%', () => {
    expect(clampSplit(10)).toBe(45);
    expect(clampSplit(99)).toBe(85);
    expect(clampSplit(70.4)).toBe(70);
    expect(clampSplit(Number.NaN)).toBe(66);
  });

  it('reads the split from the pointer over the row', () => {
    expect(splitAt(700, 100, 1000)).toBe(60);
    expect(splitAt(0, 100, 1000)).toBe(45);
    expect(splitAt(500, 0, 0)).toBe(66);
  });

  it('reads what a browser kept, and never throws on junk', () => {
    expect(parseLayout(JSON.stringify({ mode: 'big', bigId: 7, split: 72 }))).toEqual({
      mode: 'big',
      bigId: 7,
      split: 72,
    });
    expect(parseLayout('{nope')).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout(JSON.stringify({ mode: 'x', bigId: 'a', split: 500 }))).toEqual({
      mode: 'equal',
      bigId: null,
      split: 85,
    });
  });
});
