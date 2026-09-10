import { describe, expect, it } from 'vitest';
import { DTMF_KEYS, dtmfTones, isDtmfKey } from './dtmf';

describe('dtmfTones', () => {
  it('gives every pad key a pair', () => {
    for (const key of DTMF_KEYS) {
      const tones = dtmfTones(key);
      expect(tones, key).not.toBeNull();
      expect(tones).toHaveLength(2);
    }
  });

  it('matches the standard on the corners', () => {
    // If the row/column arithmetic is ever transposed these are what catch it: 1 and #
    // are opposite corners, and 0 is the one key that is not where its digit suggests.
    expect(dtmfTones('1')).toEqual([697, 1209]);
    expect(dtmfTones('3')).toEqual([697, 1477]);
    expect(dtmfTones('*')).toEqual([941, 1209]);
    expect(dtmfTones('0')).toEqual([941, 1336]);
    expect(dtmfTones('#')).toEqual([941, 1477]);
    expect(dtmfTones('5')).toEqual([770, 1336]);
  });

  it('gives every key a DISTINCT pair', () => {
    // Two keys sharing a pair means one of them dials the other, silently.
    const seen = new Set(DTMF_KEYS.map((k) => dtmfTones(k)!.join('/')));
    expect(seen.size).toBe(DTMF_KEYS.length);
  });

  it('has no tone for something that is not on the pad', () => {
    expect(dtmfTones(',')).toBeNull();
    expect(dtmfTones('A')).toBeNull();
    expect(dtmfTones('')).toBeNull();
    expect(dtmfTones('12')).toBeNull();
  });
});

describe('isDtmfKey', () => {
  it('accepts every key the pad can produce', () => {
    for (const key of DTMF_KEYS) expect(isDtmfKey(key), key).toBe(true);
  });

  it('accepts what is legal on the wire but absent from the pad', () => {
    // insertDTMF takes these; the pad just has no button for them.
    for (const key of ['A', 'B', 'C', 'D', ',']) {
      expect(isDtmfKey(key), key).toBe(true);
    }
  });

  it('rejects anything insertDTMF would throw on', () => {
    // It throws InvalidCharacterError and rejects the WHOLE string — which, since digits
    // are appended to the pending toneBuffer, would discard the already-queued ones too.
    for (const key of ['a', 'E', '+', ' ', '', '1;', 'ب']) {
      expect(isDtmfKey(key), JSON.stringify(key)).toBe(false);
    }
  });

  it('rejects a multi-character string even when every character is legal', () => {
    expect(isDtmfKey('12')).toBe(false);
  });
});
