import { describe, expect, it } from 'vitest';
import { formatE164 } from './phone';

describe('formatE164', () => {
  it('formats a NANP number for reading', () => {
    expect(formatE164('+14382560856')).toBe('(438) 256-0856');
  });

  it('returns non-NANP numbers unchanged rather than mangling them', () => {
    // Better to show a number we cannot confidently parse than to show it wrong.
    expect(formatE164('+442071838750')).toBe('+442071838750');
    expect(formatE164('+1438')).toBe('+1438');
  });

  it('handles empty input', () => {
    expect(formatE164('')).toBe('');
    expect(formatE164(null)).toBe('');
    expect(formatE164(undefined)).toBe('');
  });
});
