import { toE164 } from '@/lib/phone';
import { formatPhone } from '@/lib/utils';

/**
 * The staff phone field, shared by the create and edit dialogs.
 *
 * Shared rather than written twice because the two halves have to agree: the server takes
 * ONLY strict E.164 (`@Matches`, because this number is DIALLED — it goes verbatim into a
 * `<Number>` noun on a live call), so normalising in one dialog and not the other would
 * mean an admin could save `(514) 555-0123` from one screen and get a 400 from the other.
 *
 * Normalisation lives on the client on purpose. `toE164` guesses `+1` for a bare ten
 * digits, and a server that silently guesses a country code for a number it is about to
 * dial is a mis-dial waiting to happen; here the admin sees the normalised value before
 * they save it.
 */

/** Blank is legal — the number is optional. Anything else has to resolve to E.164. */
export function phoneErrorFor(raw: string): string | null {
  if (!raw.trim()) return null;
  return toE164(raw)
    ? null
    : 'Enter a 10-digit number, or an international one starting with +';
}

/**
 * What to send. `null` CLEARS the number; the server's `!== undefined` gate is what makes
 * that distinct from "leave it alone".
 */
export function phoneForSubmit(raw: string): string | null {
  return raw.trim() ? toE164(raw) : null;
}

/**
 * As-you-type masking that does not get in the way of an international number.
 *
 * `formatPhone` (`lib/utils.ts`) strips non-digits and slices to TEN, which is right for
 * the company forms it was written for and wrong here: it silently truncates `+442071234567`
 * to `442 071 2345` and turns a valid number into one that cannot be saved. So a value the
 * user has started with `+` is left alone, and everything else gets the familiar NANP mask.
 */
export function maskPhoneInput(raw: string): string {
  return raw.trimStart().startsWith('+') ? raw : formatPhone(raw);
}
