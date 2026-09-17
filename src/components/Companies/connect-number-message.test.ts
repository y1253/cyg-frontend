import { describe, expect, it } from 'vitest';
import {
  emptyResultMessage,
  type EmptyResultInput,
} from './connect-number-message';

const base: EmptyResultInput = {
  outcome: 'success',
  totalFound: 0,
  eligibleCount: 0,
  country: 'CANADA',
  areaCode: '',
};
const msg = (over: Partial<EmptyResultInput> = {}) =>
  emptyResultMessage({ ...base, ...over });

describe('emptyResultMessage', () => {
  it('says nothing before a search, while one runs, or when numbers were found', () => {
    expect(msg({ outcome: 'idle' })).toBeNull();
    expect(msg({ outcome: 'pending' })).toBeNull();
    expect(msg({ totalFound: 10, eligibleCount: 10 })).toBeNull();
  });

  /**
   * The measured case that prompted this: area code 208 really does offer 100 numbers and
   * not one of them can text, because US long codes are voice-only until A2P 10DLC clears.
   */
  it('names the count and the real reason for a US area code with no textable numbers', () => {
    const text = msg({ country: 'USA', areaCode: '208', totalFound: 100 })!;
    expect(text).toContain('100 numbers are available in area code 208');
    expect(text).toContain('none of them can send texts');
    expect(text).toContain('A2P 10DLC');
  });

  /**
   * ⚠️ THE RULE THIS FILE EXISTS FOR. A2P 10DLC is a US carrier rule; citing it for
   * anything else sends somebody to fix a thing that was never broken.
   */
  it('never blames A2P 10DLC when nothing was found at all', () => {
    const text = msg({ country: 'USA', areaCode: '212', totalFound: 0 })!;
    expect(text).toContain('No numbers at all');
    expect(text).toContain('Try a different area code');
    expect(text).not.toContain('10DLC');
  });

  /**
   * A failure explains nothing about inventory. The dialog shows the provider's own error
   * instead, and returning null here is what makes it impossible for a failed request to
   * reach the A2P 10DLC branch — which is what the old code did.
   */
  it('says nothing at all when the search itself failed', () => {
    expect(msg({ outcome: 'error', country: 'USA', areaCode: '438' })).toBeNull();
  });

  /**
   * The provider blip I watched: every search, Canadian included, returned empty for a few
   * minutes. The old code would have explained that with a US carrier rule.
   */
  it('never blames A2P 10DLC on a Canadian search', () => {
    expect(msg({ country: 'CANADA', areaCode: '438', totalFound: 0 })).not.toContain(
      '10DLC',
    );
    expect(msg({ country: 'CANADA', areaCode: '438', totalFound: 7 })).not.toContain(
      '10DLC',
    );
  });

  it('explains a Canadian filtered-out result without inventing a cause', () => {
    const text = msg({ country: 'CANADA', areaCode: '450', totalFound: 7 })!;
    expect(text).toContain('7 numbers are available in area code 450');
    expect(text).toContain('A support number has to do both');
  });

  it('reads correctly for exactly one number, and with no area code given', () => {
    expect(msg({ country: 'CANADA', totalFound: 1 })).toContain(
      '1 number is available in that area, but it cannot send texts',
    );
    expect(msg({ totalFound: 0 })).toContain('available in that area');
  });
});
