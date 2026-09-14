/**
 * The call-waiting tone's timing and pitch — pure, so they are tested without Web Audio.
 * `startCallWaitingTone` in `notificationSound.ts` turns them into sound.
 *
 * ── IT HAS TO BE AUDIBLE *THROUGH* A CONVERSATION, AND NOT BE THE RINGTONE ──────
 * This plays while the agent is talking to somebody else, which makes it the opposite
 * design problem from `ringtone.ts`: that one competes with a ringing desk phone, this one
 * has to slip between sentences without drowning the customer out or being mistaken for
 * either of the two sounds the agent already knows.
 *
 * Three sounds now exist, and they are separated on every axis at once:
 *
 * |               | pitch                       | shape      | cycle |
 * |---------------|-----------------------------|------------|-------|
 * | ringtone      | 800/1000 trilled at 25 Hz   | 0.4s x2    | 3s    |
 * | PSTN ringback | 440+480, two steady tones   | 2s         | 6s    |
 * | call waiting  | 1318.5, ONE steady tone     | 0.2s x2    | 10s   |
 *
 * It cannot be heard as the ringtone (no trill, higher, far shorter, far sparser) nor as
 * ringback (a single frequency, an order of magnitude shorter and sparser). The sparse
 * cycle is the point: a pip-pair every ten seconds is a reminder, not an alarm.
 */

/** Two short pips, then a long silence. Seconds from the cycle's start. */
export const CW_BURSTS = [
  { at: 0.0, length: 0.2 },
  { at: 0.34, length: 0.2 },
] as const;

/** 0.2 pip + 0.14 gap + 0.2 pip + ~9.5s of quiet. */
export const CW_CYCLE = 10.0;

/**
 * Stops a little past the `<Dial timeout="30">` the inbound webhook sends.
 *
 * Shorter than the ringtone's 60s on purpose: once the dial has timed out the caller is
 * in voicemail, and a pip in the agent's ear for a call that no longer exists is worse
 * than no pip at all.
 */
export const CW_TOTAL_SECONDS = 40;

/** E6. High enough to cut through speech, short enough not to mask it. */
export const CW_HZ = 1318.5;

/** Every pip's start and end over the whole tone, in seconds from the first. */
export function callWaitingSchedule(): { on: number; off: number }[] {
  const cycles = Math.ceil(CW_TOTAL_SECONDS / CW_CYCLE);
  const bursts: { on: number; off: number }[] = [];
  for (let i = 0; i < cycles; i++) {
    for (const burst of CW_BURSTS) {
      const on = i * CW_CYCLE + burst.at;
      if (on >= CW_TOTAL_SECONDS) break;
      bursts.push({ on, off: Math.min(on + burst.length, CW_TOTAL_SECONDS) });
    }
  }
  return bursts;
}
