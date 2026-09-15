import { describe, expect, it } from 'vitest';
import { isFacebookOrigin, parseSignupMessage } from './facebookSdk';

/**
 * The two rules that decide whether a window message is trusted and what it means. Both
 * fail quietly: a wrong origin check accepts ids from any page, and a misread event
 * leaves the connect button spinning with no error.
 */

describe('isFacebookOrigin', () => {
  it('accepts facebook.com and its subdomains only', () => {
    expect(isFacebookOrigin('https://www.facebook.com')).toBe(true);
    expect(isFacebookOrigin('https://facebook.com')).toBe(true);
    expect(isFacebookOrigin('https://evilfacebook.com')).toBe(false);
    expect(isFacebookOrigin('https://facebook.com.evil.io')).toBe(false);
    expect(isFacebookOrigin('not a url')).toBe(false);
  });
});

describe('parseSignupMessage', () => {
  const finish = {
    type: 'WA_EMBEDDED_SIGNUP',
    event: 'FINISH',
    data: { phone_number_id: '111', waba_id: '222', business_id: '333' },
  };

  it('reads the chosen ids from a FINISH event, object or JSON string', () => {
    const expected = { kind: 'finish', wabaId: '222', phoneNumberId: '111' };
    expect(parseSignupMessage(finish)).toEqual(expected);
    expect(parseSignupMessage(JSON.stringify(finish))).toEqual(expected);
  });

  it('treats a finish without a phone number as an error, not a success', () => {
    expect(
      parseSignupMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_ONLY_WABA', data: { waba_id: '222' } }),
    ).toMatchObject({ kind: 'error' });
  });

  it('reports cancel and error events', () => {
    expect(
      parseSignupMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE_NUMBER_SETUP' } }),
    ).toEqual({ kind: 'cancel', step: 'PHONE_NUMBER_SETUP' });
    expect(
      parseSignupMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error_message: 'Nope' } }),
    ).toEqual({ kind: 'error', message: 'Nope' });
  });

  it('ignores everything else Facebook posts', () => {
    expect(parseSignupMessage({ type: 'SOMETHING_ELSE' })).toBeNull();
    expect(parseSignupMessage('cb=f1234&relation=opener')).toBeNull();
    expect(parseSignupMessage(null)).toBeNull();
  });
});
