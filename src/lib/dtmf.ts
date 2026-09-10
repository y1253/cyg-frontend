/**
 * DTMF: the keypad, and the pair of frequencies each key is made of.
 *
 * Pure and dependency-free so it can be unit-tested — vitest runs in `node` here, with no
 * Web Audio and no DOM. The audio half lives in `notificationSound.ts` and takes the two
 * frequencies from this table rather than a digit, which is what keeps the table testable.
 */

/** A key that can be sent. */
export type DtmfKey = (typeof DTMF_KEYS)[number];

/**
 * The pad, in reading order — three columns, four rows.
 *
 * `A`–`D` exist in the standard (a fourth column at 1633 Hz) but have not been on a
 * consumer phone since the 1960s and no IVR asks for them, so they are not on the pad.
 * `isDtmfKey` still accepts them, and `,` (a two-second pause), because those are legal
 * for `insertDTMF` and a stored extension string may one day contain one.
 */
export const DTMF_KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '*',
  '0',
  '#',
] as const;

/**
 * Row and column tones. A DTMF key is the SUM of one of each, which is what makes it
 * detectable through a lossy voice codec: no single voice fundamental lands on both.
 */
const ROW_HZ = [697, 770, 852, 941];
const COL_HZ = [1209, 1336, 1477];

/** The `[low, high]` pair for a key, or null when it has no tone (`,` is a pause). */
export function dtmfTones(key: string): [number, number] | null {
  const index = (DTMF_KEYS as readonly string[]).indexOf(key);
  if (index < 0) return null;
  return [ROW_HZ[Math.floor(index / 3)], COL_HZ[index % 3]];
}

/**
 * Is this something `RTCDTMFSender.insertDTMF` will accept?
 *
 * ⚠️ `insertDTMF` throws `InvalidCharacterError` on an illegal character and rejects the
 * **whole string** — which, because digits are appended to the pending `toneBuffer`, would
 * take the already-queued digits down with it. So this runs before the append, not just
 * before the call.
 *
 * Deliberately wider than `DTMF_KEYS`: the pad cannot produce `A`–`D` or `,`, but they are
 * legal on the wire and rejecting them here would be a second, stricter rule in a second
 * place.
 */
export function isDtmfKey(key: string): boolean {
  return /^[0-9A-D#*,]$/.test(key);
}
