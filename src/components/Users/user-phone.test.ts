import { describe, expect, it } from 'vitest';
import { maskPhoneInput, phoneErrorFor, phoneForSubmit } from './user-phone';

describe('phoneErrorFor', () => {
  it('accepts a blank field — the number is optional', () => {
    expect(phoneErrorFor('')).toBeNull();
    expect(phoneErrorFor('   ')).toBeNull();
  });

  it('accepts the shapes toE164 resolves', () => {
    for (const value of [
      '514-555-0123',
      '(514) 555-0123',
      '5145550123',
      '15145550123',
      '+15145550123',
      '+442071234567',
    ]) {
      expect(phoneErrorFor(value)).toBeNull();
    }
  });

  it('rejects anything that cannot be dialled', () => {
    // The server takes ONLY strict E.164 here, because this value goes verbatim into a
    // <Number> noun on a live call. Catching it in the form is what stops a 400 the admin
    // cannot interpret.
    for (const value of ['555-0123', '12345', 'not a number', '+1']) {
      expect(phoneErrorFor(value)).not.toBeNull();
    }
  });
});

describe('phoneForSubmit', () => {
  it('normalises to E.164', () => {
    expect(phoneForSubmit('514-555-0123')).toBe('+15145550123');
    expect(phoneForSubmit('+442071234567')).toBe('+442071234567');
  });

  it('is NULL for a cleared field, which is what removes the number', () => {
    // Not `undefined`: an absent key means "leave it alone" to the server, so an admin
    // could never take a mobile off a user once it had been saved.
    expect(phoneForSubmit('')).toBeNull();
    expect(phoneForSubmit('  ')).toBeNull();
  });
});

describe('maskPhoneInput', () => {
  it('formats a NANP number as it is typed', () => {
    expect(maskPhoneInput('5145550123')).toBe('514-555-0123');
    expect(maskPhoneInput('514')).toBe('514');
  });

  it('LEAVES an international number alone', () => {
    // `formatPhone` strips non-digits and slices to TEN, which silently truncates
    // +442071234567 into something that can never be saved. A value starting with `+` is
    // the user telling us they know what they are doing.
    expect(maskPhoneInput('+442071234567')).toBe('+442071234567');
    expect(maskPhoneInput('+1 514 555 0123')).toBe('+1 514 555 0123');
  });

  it('round-trips through the submit helper', () => {
    expect(phoneForSubmit(maskPhoneInput('5145550123'))).toBe('+15145550123');
    expect(phoneForSubmit(maskPhoneInput('+442071234567'))).toBe(
      '+442071234567',
    );
  });
});
