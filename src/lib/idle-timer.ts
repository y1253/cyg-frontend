/**
 * The 60-minute idle sign-out, SHARED by every tab (step2.md, 2026-11-05).
 *
 * Every tab used to run its own timer from its own events, so a tab left alone in the
 * background for an hour called `logout('IDLE')` — which ends the ONE server session all
 * tabs share — and signed out the tab somebody was working in. Each tab still writes
 * `lastActivity`; a timer that fires now re-reads it and only signs out when NO tab was
 * used for the whole window.
 */

/** Activity is written at most this often — it ran on every mousemove before. */
export const ACTIVITY_WRITE_MS = 5_000;

/** Milliseconds left before the idle sign-out, from the newest activity of any tab. */
export function idleRemainingMs(
  lastActivity: string | null,
  now: number,
  timeoutMs: number,
): number {
  const last = lastActivity ? Number.parseInt(lastActivity, 10) : NaN;
  if (!Number.isFinite(last)) return 0;
  // A clock that moved backwards (or a value from the future) counts as "just now".
  return Math.max(0, Math.min(timeoutMs, last + timeoutMs - now));
}

/** Whether this event should write `lastActivity` (throttled). */
export function shouldWriteActivity(lastWrite: number, now: number): boolean {
  return now - lastWrite >= ACTIVITY_WRITE_MS || now < lastWrite;
}
