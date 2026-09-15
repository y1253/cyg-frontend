import { describe, expect, it } from 'vitest';
import { badgeLabel } from './tab-badge';

describe('badgeLabel', () => {
  it('draws no badge for zero, a negative, or an unknown count', () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-1)).toBeNull();
    expect(badgeLabel(undefined)).toBeNull();
    expect(badgeLabel(null)).toBeNull();
    expect(badgeLabel(Number.NaN)).toBeNull();
  });

  it('shows the exact count from 1 to 9', () => {
    expect(badgeLabel(1)).toBe('1');
    expect(badgeLabel(9)).toBe('9');
  });

  it('caps at 9+ — a third glyph is unreadable in a 16px tab icon', () => {
    expect(badgeLabel(10)).toBe('9+');
    expect(badgeLabel(250)).toBe('9+');
  });
});
