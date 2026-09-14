/**
 * The incoming-call ringtone's timing and pitches — pure, so they are tested without Web
 * Audio. `startRinging` in `notificationSound.ts` turns them into sound.
 *
 * ── WHY IT IS A TRILL, NOT A TONE ──────────────────────────────────────────────
 * The ring used to be the North-American RINGBACK: a steady 440+480 Hz chord, 2s on and
 * 4s off. That is exactly the tone the phone network plays to the agent while an OUTBOUND
 * call rings, so an incoming call and an outgoing one sounded identical. A telephone BELL
 * is a different sound: a fast trill between two pitches, rung "ring-ring … pause".
 */

/** "ring-ring … pause": two short trills per cycle. Seconds from the cycle's start. */
export const RING_BURSTS = [
  { at: 0.0, length: 0.4 },
  { at: 0.6, length: 0.4 },
] as const;

/** 0.4 trill + 0.2 gap + 0.4 trill + 2.0 silence. */
export const RING_CYCLE = 3.0;

/** How long an unanswered call rings before the tone gives up. Same total as before. */
export const RING_TOTAL_SECONDS = 60;

/** The two pitches the trill alternates between, and how fast it alternates. */
export const TRILL_LOW_HZ = 800;
export const TRILL_HIGH_HZ = 1000;
export const TRILL_RATE_HZ = 25;

/** Every burst's start and end over the whole ring, in seconds from the first. */
export function ringSchedule(): { on: number; off: number }[] {
  const cycles = Math.floor(RING_TOTAL_SECONDS / RING_CYCLE);
  const bursts: { on: number; off: number }[] = [];
  for (let i = 0; i < cycles; i++) {
    for (const burst of RING_BURSTS) {
      const on = i * RING_CYCLE + burst.at;
      bursts.push({ on, off: on + burst.length });
    }
  }
  return bursts;
}
