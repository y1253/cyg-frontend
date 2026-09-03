/**
 * Voicemail length options, shared by the global defaults page and the per-company
 * override card.
 *
 * In `lib/` rather than beside either editor because both need it: exporting a constant
 * from a component file breaks React Fast Refresh, and duplicating the list is how the
 * two screens end up offering different choices for the same field.
 */

/**
 * Ceiling on ONE message. `<Record>` is billed per minute and the audio is stored on
 * SignalWire, so this is a cost control as much as a UX one — a caller who puts the phone
 * down in a pocket records until the provider's own limit otherwise.
 */
export const VOICEMAIL_SECONDS = [60, 90, 120, 180, 300];

/** "2 minutes" reads better than "120 seconds"; anything not a whole minute stays in seconds. */
export function voicemailLengthLabel(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} seconds`;
}
